/**
 * Day Slot Tagger
 * 
 * Assigns a `day_slot` to every place based on category, name, and subcategory.
 * Slots: morning, midday, afternoon, evening, anytime
 * 
 * This is a DETERMINISTIC layer — no LLM involved.
 * Inspired by how Wanderlog/TripAdvisor schedule places by time-of-day.
 */

// Category → default slot mapping
const CATEGORY_SLOT_MAP = {
    // Morning attractions
    viewpoint: 'morning',
    temple: 'morning',
    church: 'morning',
    park: 'morning',

    // Midday attractions
    museum: 'midday',
    fort: 'midday',
    beach: 'midday',
    island: 'midday',
    monument: 'midday',
    heritage: 'midday',

    // Afternoon attractions
    waterfall: 'afternoon',
    shopping: 'afternoon',
    adventure: 'afternoon',
    peak: 'afternoon',
    trek: 'afternoon',

    // Evening
    nightlife: 'evening',
    bar: 'evening',
    pub: 'evening',

    // Food defaults
    cafe: 'morning',
    restaurant: 'midday',
};

// Name patterns that override category-based slots
const NAME_OVERRIDES = [
    { pattern: /sunset/i, slot: 'evening' },
    { pattern: /sunrise/i, slot: 'morning' },
    { pattern: /night\s*market/i, slot: 'evening' },
    { pattern: /flea\s*market/i, slot: 'afternoon' },
    { pattern: /brunch/i, slot: 'morning' },
    { pattern: /breakfast/i, slot: 'morning' },
    { pattern: /bakery/i, slot: 'morning' },
    { pattern: /grill|tandoor|bistro|steakhouse|seafood/i, slot: 'evening' },
    { pattern: /cocktail|lounge|club/i, slot: 'evening' },
    { pattern: /hilltop|hill\s*top/i, slot: 'morning' },
];

/**
 * Assign a day_slot to a single place.
 * 
 * @param {Object} place - Place object with at least { name, category, subcategory? }
 * @returns {string} - 'morning' | 'midday' | 'afternoon' | 'evening' | 'anytime'
 */
export function assignDaySlot(place) {
    const name = (place.name || '').toLowerCase();
    const category = (place.category || '').toLowerCase();
    const subcategory = (place.subcategory || '').toLowerCase();

    // 1. Name overrides take highest priority (sunset beach → evening, not midday)
    for (const { pattern, slot } of NAME_OVERRIDES) {
        if (pattern.test(name)) {
            return slot;
        }
    }

    // 2. Subcategory check (more specific than category)
    if (CATEGORY_SLOT_MAP[subcategory]) {
        return CATEGORY_SLOT_MAP[subcategory];
    }

    // 3. Category check
    if (CATEGORY_SLOT_MAP[category]) {
        return CATEGORY_SLOT_MAP[category];
    }

    // 4. Fallback
    return 'anytime';
}

/**
 * Assign day_slot to all places in a normalized places array.
 * Mutates in place.
 * 
 * @param {Array} places - Array of normalized place objects
 */
export function assignDaySlots(places) {
    for (const place of places) {
        place.day_slot = assignDaySlot(place);
    }
}

// Slot ordering for time-of-day sorting
export const SLOT_ORDER = {
    morning: 0,
    midday: 1,
    afternoon: 2,
    evening: 3,
    anytime: 1.5
};
