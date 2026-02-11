# V2 Roadmap: Smart Itinerary System

This document outlines architectural improvements and feature enhancements planned for **Version 2** of the Itinerary Generation System, following the MVP (V1) release.

These items address known limitations in the current V1 implementation and aim to transform the system from "Functional" to "Intelligent & Scalable".

## 1. Data Enrichment & Hydration (High Priority)

**Problem:** The current V1 schema (`Place`) does not store `lat` and `lon` coordinates, leading to data loss during normalization.
**Impact:** Impossible to render maps, calculate travel times, or do proximity clustering.
**Solution:**

- Update `destination_schema.py` to include `lat` (float) and `lon` (float).
- Implement a "Hydration Step" after the LLM returns the itinerary:
  - Match LLM place names back to the raw Overpass data.
  - Copy `lat`, `lon`, `website`, `phone`, and other metadata into the final response.

## 2. Geographic Awareness & Clustering

**Problem:** Day 1 activities might be scattered across North Goa (e.g., Arambol to Candolim) without regard for travel time.
**Solution:**

- Implement **Geo-Clustering** for daily buckets.
- Use `K-Means` or simple bounding box logic to group nearby places together.
- Ensure morning activities are geographically close to afternoon activities.

## 3. Advanced Travel Profile Logic

**Problem:** The `travel_profile` inputs (`min_days`, `ideal_days`, `pace`) are currently informational.
**Solution:**

- **Compression Logic:** If `user_days < min_days`, trigger a warning or adjust the `pace` to "fast".
- **Split Stay Enforcement:** If `needs_split_stay` is true, strictly enforce a hotel change in the itinerary structure.

## 4. Intelligent Deduplication

**Problem:** The system treats "Cafe Coffee Day" and "CCD" as different places if Overpass returns them separately.
**Solution:**

- Implement a deduplication layer using:
  - **Fuzzy Name Matching** (Levenshtein distance).
  - **Geo-Proximity Check** (If names are similar AND distance < 100m => Duplicate).

## 5. Cost Modeling (Future)

**Problem:** Budget is currently ignored.
**Solution:**

- Add price tier tagging (`$`, `$$`, `$$$`) to places.
- Implement a budget estimator based on selected activities and dining spots.

---

_Created: Feb 2026_
_Ref: Feedback Analysis_
