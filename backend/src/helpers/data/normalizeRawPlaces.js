import { assignDaySlot } from '../planning/assignDaySlots.js';

function getCategoryFromTags(tags) {
  if (tags.natural === "beach") return "beach";
  if (tags.historic === "fort" || tags.historic === "castle") return "fort";
  if (tags.tourism === "museum") return "museum";
  if (tags.amenity === "restaurant") return "restaurant";
  if (tags.amenity === "cafe") return "cafe";
  if (tags.amenity === "bar" || tags.amenity === "pub" || tags.amenity === "nightclub") return "nightlife";
  if (tags.leisure === "park" || tags.leisure === "nature_reserve") return "park";
  if (tags.tourism === "viewpoint") return "viewpoint";
  if (tags.waterway === "waterfall") return "waterfall";

  // Fallback to generic tag keys
  return tags.tourism || tags.historic || tags.natural || tags.leisure || tags.amenity || "unknown";
}

// [PHASE 7] Robust Scoring & Deduplication
// We use a multi-pass approach:
// 1. Calculate "Commercial Density" (Hub Signal) for every place.
// 2. Canonical Clustering (Merge duplicates & combine tags).
// 3. Final Scoring (Category + Hub + Meta) with Soft Scaling.


function normalizeRawPlaces(rawPlaces) {
  // 1. Initial Cleanup
  let places = rawPlaces
    .filter((p) => p.tags && p.tags.name)
    .map((p) => {
      const tags = p.tags || {};
      return {
        id: p.id,
        name: tags.name,
        lat: p.lat ?? p.center?.lat,
        lon: p.lon ?? p.center?.lon,
        tags: tags,
        category: getCategoryFromTags(tags),
        base_category: getCategoryFromTags(tags), // preserve original
        raw_type: tags.tourism || tags.natural || tags.amenity || "other"
      };
    })
    .filter((p) => p.lat && p.lon);

  // [PHASE 5] Generic Chain Filter
  places = places.filter((p) => {
    const name = p.name ? p.name.toLowerCase() : "";
    const blockedChains = [
      "cafe coffee day", "ccd", "starbucks", "barista",
      "mcdonald", "burger king", "kfc", "domino", "pizza hut", "subway",
      "costa coffee", "chai point", "dunkin"
    ];
    return !blockedChains.some(chain => name.includes(chain));
  });

  // 2. Calculate Commercial Density (Hub Signal)
  // O(N^2) is fine for ~3500 items (approx 12M checks, <100ms in V8)
  // We count "Amenities" within 1km
  const commercialPlaces = places.filter(p =>
    ['restaurant', 'cafe', 'nightlife', 'hotel', 'guest_house', 'hostel'].includes(p.category) ||
    p.tags.shop
  );

  places.forEach(p => {
    let neighborCount = 0;
    // optimization: simple bounding box check before dist
    const latThreshold = 0.01; // ~1km
    const lonThreshold = 0.01;

    for (const comm of commercialPlaces) {
      if (Math.abs(comm.lat - p.lat) > latThreshold) continue;
      if (Math.abs(comm.lon - p.lon) > lonThreshold) continue;
      // Self-check
      if (comm.id === p.id) continue;

      const dist = getDistanceKm(p.lat, p.lon, comm.lat, comm.lon);
      if (dist <= 1.0) neighborCount++;
    }
    p.hub_density = neighborCount;
  });

  // 3. Canonical Clustering (Aggressive Dedup)
  // Sort by Metadata Density first to find "Primary" candidates
  places.sort((a, b) => Object.keys(b.tags).length - Object.keys(a.tags).length);

  const clustered = [];
  const mergedIds = new Set();

  for (const place of places) {
    if (mergedIds.has(place.id)) continue;

    const cluster = [place];
    mergedIds.add(place.id);

    // Look for duplicates in remaining
    for (const candidate of places) {
      if (mergedIds.has(candidate.id)) continue;

      // Distance Check (Stricter for businesses, looser for beaches)
      const dist = getDistanceKm(place.lat, place.lon, candidate.lat, candidate.lon);
      let threshold = 0.1; // 100m default
      if (['beach', 'fort', 'island'].includes(place.category)) threshold = 0.5; // 500m for huge anchors

      if (dist > threshold) continue;

      // Name Similarity
      const norm1 = normalizePlaceKey(place.name);
      const norm2 = normalizePlaceKey(candidate.name);

      const isNameMatch = norm1 === norm2 || norm1.includes(norm2) || norm2.includes(norm1);
      const sim = getSimilarity(norm1, norm2);

      if (isNameMatch || sim >= 0.85) {
        cluster.push(candidate);
        mergedIds.add(candidate.id);
      }
    }

    // Merge Cluster into Canonical
    // Primary is index 0 (Highest tag density)
    const primary = cluster[0];

    // Merge tags from others
    for (let i = 1; i < cluster.length; i++) {
      primary.tags = { ...cluster[i].tags, ...primary.tags }; // Primary takes precedence but fill gaps
    }

    // Recalculate density (max of cluster)
    const maxDensity = Math.max(...cluster.map(c => c.hub_density));
    primary.hub_density = maxDensity;

    clustered.push(primary);
  }

  // 4. Robust Scoring
  return clustered.map(p => {
    const tags = p.tags;
    const category = p.category;

    // A. Category Base [PHASE 8: Fort/Waterfall boosted 60→75]
    let baseScore = 10;
    if (category === 'beach') baseScore = 70;
    else if (category === 'waterfall') baseScore = 75;
    else if (category === 'fort') baseScore = 75;
    else if (category === 'island') baseScore = 60;
    else if (category === 'museum') baseScore = 45;
    else if (category === 'viewpoint') baseScore = 40;
    else if (category === 'peak') baseScore = 35;
    else if (category === 'attraction') baseScore = 30;

    // B. Hub Bonus (Popularity Proxy)
    // log(1) = 0, log(10) = 2.3, log(50) = 3.9, log(100) = 4.6
    // Multiplier 15 -> 100 neighbors adds ~70 points
    const hubBonus = Math.log(p.hub_density + 1) * 15;

    // C. Metadata Score (Quality)
    let metaScore = 0;
    if (tags.wikipedia) metaScore += 30;
    if (tags.wikidata) metaScore += 20;
    if (tags.website || tags['contact:website']) metaScore += 10;
    if (tags.image) metaScore += 10;
    if (tags.description) metaScore += 10;
    if (tags.cuisine) metaScore += 5;
    if (tags.opening_hours) metaScore += 5;

    // D. Commercial-Only Penalty [PHASE 8]
    // Attractions with no tourism/natural signal are likely noise (wedding halls, bowling alleys)
    if (category === 'attraction' && !tags.tourism && !tags.natural && !tags.historic) {
      baseScore -= 10;
    }

    const rawScore = baseScore + hubBonus + metaScore;

    // E. Soft Scaling (0-100)
    let finalScore = 100 * (1 - Math.exp(-rawScore / 60));

    // F. Noise Cap [PHASE 8]
    // If a place has NO tourism signals at all, cap at 60 to prevent
    // noise like "Laxmi's Home" or "Thrill zone" from outranking landmarks.
    const hasTourismSignal = tags.wikipedia || tags.wikidata || tags.image
      || tags.tourism || tags.natural || tags.historic;
    if (!hasTourismSignal && finalScore > 60) {
      finalScore = 60;
    }

    return {
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      category: category,
      raw_type: p.raw_type,
      tags: Object.keys(tags), // list of keys
      quality_score: Math.round(finalScore),
      day_slot: assignDaySlot(p),
      _debug: { raw: Math.round(rawScore), hub: Math.round(hubBonus), dens: p.hub_density }
    };
  });
}

// --- Helper Functions ---

function levenshteinDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

function getSimilarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2;
  if (longer.length === 0) return 1.0;
  return (longer.length - levenshteinDistance(s1, s2)) / longer.length;
}

// Normalize a place name for deduplication:
// - lower-case
// - strip punctuation
// - strip common suffixes like "beach", "blue flag beach", "sunrise", "sunset"
function normalizePlaceKey(name) {
  let key = (name || "").toLowerCase();

  // Remove common descriptive suffixes
  const suffixes = [
    " - blue flag beach",
    " blue flag beach",
    " blue flag",
    " beach",
    " sunrise beach",
    " sunset beach",
    " sunrise",
    " sunset",
  ];

  for (const suffix of suffixes) {
    if (key.endsWith(suffix)) {
      key = key.slice(0, -suffix.length);
      break;
    }
  }

  // Strip non-alphanumerics
  return key.replace(/[^a-z0-9]/g, "");
}

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export { normalizeRawPlaces };
