# Kairos — Canonical Project Documentation

This document is the **single source of truth** for the Kairos project.
It consolidates **all design decisions, rules, models, workflows, and future plans** discussed so far.

This file is intentionally verbose and explicit so that:

- Future-you does not forget why decisions were made
- AI tools (Antigravity, LLMs, assistants) can work with full context
- No step in the workflow is skipped accidentally

---

## 1. Project Overview

### What is Kairos?

Kairos is a full-stack, AI-assisted **domestic travel planner**. It helps users plan trips based on **budget and/or number of days**, with the **destination being optional**. If the user does not know where to go, Kairos can suggest destinations.

### Core philosophy

- One place to get a **complete overview** of a trip
- Honest **estimates**, not fake precision
- AI for **suggestions and narration**, logic for **math and feasibility**
- No bookings, only redirection to trusted external platforms

### What Kairos is NOT

- Not a booking platform
- Not a social or review platform
- Not a chatbot that hallucinates itineraries

---

## 2. Product Scope

### MVP Features

- Days-based trip planning (days mandatory), optional budget-based constraint
- Optional destination input
- Day-wise itinerary generation
- Hotel suggestions (redirect-only)
- Transport options (road, train, flight)
- Estimated total cost with budget comparison

### Explicit Non-Features (MVP)

- No authentication
- No payments or bookings
- No reviews
- No saved trips
- No international travel

### Assumptions

- Domestic travel only
- All prices are **estimates**
- Clarity is more important than exactness

---

## 3. User Flow

1. User lands on Kairos
2. User either:
   - Provides a destination, OR
   - Asks Kairos to suggest one
3. User provides number of days (mandatory) and optionally a budget
4. Kairos generates a draft itinerary
5. User reviews itinerary
6. Kairos shows basic transport options (if source is provided)
7. User optionally explores detailed transport info
8. Hotel suggestions are shown as part of the plan
9. User can regenerate the plan by changing constraints

---

## 4. Itinerary & Data Model

### Itinerary (Trip-level)

- destination
- total_days
- user_budget (optional) — days are mandatory
- estimated_total_cost
- budget_status (within_budget / exceeds_budget)
- hotel_strategy (single_stay / split_stay)
- transport_summary (basic)
- hotels (normalized list)
- days (list of Day objects)
- extra_suggestions
- assumptions
- warnings
- metadata (generation info, cache hints)

### Day

- day_number
- region_id / region_name
- places (object)
  - main (list of Place)
  - optional (list of Place)
- hotel_suggestions (by area)
- travel_intensity (low / medium / high)
- notes / assumptions

### Place

- name
- type (attraction / food / experience)
- category (nature / heritage / food / nightlife)
- subcategory (beach / fort / restaurant / club)
- specialty (unique traits e.g. ["sunset", "live_music"])
- best_time (morning / afternoon / evening / anytime)
- short_description
- notes
- priority (main / optional)

### Hotel

- name
- area / locality
- city
- price_range (estimated)
- rating (optional)
- image_url
- source (Booking / Agoda / etc.)
- redirect_url

### Transport (Basic)

- mode (road / train / flight)
- estimated_time
- estimated_cost
- notes

---

## 5. Itinerary Generation Pipeline

1. Collect and normalize user constraints (days mandatory, budget optional)
2. Resolve destination (user-provided or AI-suggested)
3. Fetch destination context (Overpass split queries: Anchors + Lifestyle)
4. Decide itinerary shape (days, single vs split stay)
5. Allocate unique places to days (Time-Aware Allocation: Morning -> Night flow)
6. Add optional nearby suggestions
7. Estimate total trip cost
8. Generate itinerary narration using AI (text only)
9. Prepare basic transport options
10. Fetch and attach hotel data (cached)
11. Attach assumptions and warnings
12. Return structured itinerary response

Rules:

- AI never calculates prices
- Deterministic logic owns feasibility
- Hotels are fetched during generation, not lazily on click

---

## 6. Tech Stack (Locked)

### Frontend

- React (Vite)
- JavaScript
- Plain React hooks
- No Next.js

### Backend

- Node.js
- Express

### AI

- Grok (xAI)
- Used only for narration, suggestions, explanations

### Infra

- Redis (caching, rate limiting, AI cache)
- BullMQ (async/background jobs)

### Data

- Static JSON initially
- Redis as hot cache
- Database added later only if needed

---

## 7. Architecture Decisions (Why Things Are This Way)

- No Next.js to focus on mastering React fundamentals
- No root-level npm project
- Separate frontend and backend npm projects
- Backend is stateless for MVP
- Full regeneration when constraints change
- No lazy hotel fetching
- AI never performs math or feasibility checks

---

## 8. AI Usage Rules

### AI is allowed to:

- Suggest destinations
- Generate itinerary narration
- Explain tradeoffs and assumptions

### AI must never:

- Hallucinate prices
- Perform calculations
- Decide feasibility

### Input to AI

- Structured JSON only

### Output handling

- Always validated
- Never trusted blindly

### Failure handling

- Fallback to cached/static data
- Graceful error messaging

---

## 9. Coding Principles & Workflow Rules

### Development philosophy

- Developer writes all logic first
- AI reviews and suggests improvements later
- Naive code by the developer is better than perfect AI code

### Rules

- Do not skip design or setup steps
- No premature abstractions
- Backend-first approach
- Fancy infrastructure allowed if it has learning value
- Files are created **only when needed**, not in advance

### Workflow order (must be followed)

1. Design (completed)
2. Tech stack lock
3. Repo & folder setup
4. Derive backend responsibilities
5. Write backend logic
6. Build frontend
7. Refine AI + infra

---

## 10. Future Roadmap

### Phase 2 (See `docs/v2_roadmap.md` for details)

- **Data Hydration:** Add lat/lon and metadata
- **Geo-Clustering:** Optimize day flow by distance
- **Travel Profile Enforcement:** Smart day-count compression
- Database integration
- Save trips
- User preferences

### Phase 3

- Personalization
- Smarter recommendations
- Cost optimization

### Infra improvements

- Better caching strategies
- Observability
- Performance tuning
