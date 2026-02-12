# V2 Roadmap: Smart Itinerary System

This document outlines architectural improvements and feature enhancements planned for **Version 2** of the Itinerary Generation System, following the MVP (V1) release.

These items address known limitations in the current V1 implementation and aim to transform the system from "Functional" to "Intelligent & Scalable".

## 1. Data Enrichment & Hydration (COMPLETED in V1)

- **Status:** Done (Feb 2026).
- **Implementation:** `hydratePlaces.js` matches AI output to raw Overpass coordinates.
- **Result:** 100% hydration rate achieved for Goa.

## 2. Geographic Validation & Clustering (Critical)

**Problem:** V1 places may have inconsistent Lat/Lon data or be assigned to the wrong region (e.g., North Goa vs South Goa boundaries).
**Solution:**

- **Region Boundary Validation:** Use bounding boxes or centroids to validate that a place belongs to its assigned region.
- **Geo-Consistency Checks:** Prevent region–coordinate mismatches.
- **Distance-Aware Planning:**
  - Once data is validated, use Lat/Lon for **Clustering** (morning/afternoon proximity).
  - Use Lat/Lon for **Travel Time Estimation**.

**Constraint:** Until V2 validation is built, Lat/Lon must remain **Metadata Only** and not influence ranking or selection.

## 3. Advanced Travel Profile Logic

**Problem:** The `travel_profile` inputs (`min_days`, `ideal_days`, `pace`) are currently informational.
**Solution:**

- **Compression Logic:** If `user_days < min_days`, trigger a warning or adjust the `pace` to "fast".
- **Split Stay Enforcement:** If `needs_split_stay` is true, strictly enforce a hotel change in the itinerary structure.

## 4. Intelligent Deduplication

**Problem:** The system treats "Cafe Coffee Day" and "CCD" as different places if Overpass returns them separately.
**Solution:**

- **Implementation:** Deduplication layer using Fuzzy Name Matching (Levenshtein) + Geo-Proximity (<100m).

## 5. Cost Modeling (Future)

**Problem:** Budget is currently ignored.
**Solution:**

- Add price tier tagging (`$`, `$$`, `$$$`) to places.
- Implement a budget estimator based on selected activities and dining spots.

## 6. Robust Geocoding Fallback

**Problem:** V1 uses a "Round-Robin" workaround for places with missing coordinates (`null` lat/lon), which introduces artificial randomness and lowers clustering quality.
**Solution:**

- **Geocoding Service:** Integrate a fallback geocoder (e.g., Nominatim or Google Maps API).
- **Logic:** If Overpass fails to provide coordinates, query the fallback service by place name + region.
- **Goal:** Achieve 100% true coordinate coverage to eliminate the need for random distribution.

---

_Created: Feb 2026_
_Updated: Feb 12, 2026_
