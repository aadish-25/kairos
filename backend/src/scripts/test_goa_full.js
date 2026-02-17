import { getDestinationContext } from '../helpers/getDestinationContext.js';
import { decideItineraryShape } from '../helpers/planning/itineraryShaper.js';
import { buildDayBuckets } from '../helpers/planning/dayBucketBuilder.js';
import { allocatePlacesToDayBuckets } from '../helpers/planning/placeAllocator.js';
import dotenv from 'dotenv';
dotenv.config();

async function testGoaFull() {
    try {
        console.log("=== V6 End-to-End Test (Full Pipeline: Goa) ===");

        // 1. Get Context (Includes Food Pool & Regions)
        console.log("Step 1: Building Destination Context...");
        const destinationContext = await getDestinationContext("Goa");
        console.log(`Context Built. Regions: ${destinationContext.regions.length}`);

        if (destinationContext.travel_profile) {
            console.log("Travel Profile:", JSON.stringify(destinationContext.travel_profile, null, 2));
        }

        if (destinationContext.regions.length === 0) {
            console.error("No regions generated! Aborting.");
            process.exit(1);
        }

        // 2. Shape Itinerary
        console.log("\nStep 2: Shaping Itinerary...");
        const days = 6; // Force a 6-day trip for testing
        const itineraryShape = decideItineraryShape(days, destinationContext);
        console.log("Shape:", JSON.stringify(itineraryShape, null, 2));

        // 3. Build Buckets
        console.log("\nStep 3: Building Day Buckets...");
        const dayBuckets = buildDayBuckets(itineraryShape);
        console.log(`Buckets: ${dayBuckets.length} days`);

        // 4. Allocate Places (The Real Test)
        console.log("\nStep 4: Allocating Places (Food Enrichment Check)...");
        const dayPlans = allocatePlacesToDayBuckets(dayBuckets, destinationContext);

        // 5. Report
        console.log("\n=== FINAL DAY PLANS ===");
        dayPlans.forEach(day => {
            console.log(`\nDay ${day.day} (${day.region_name}):`);

            const mains = day.places.main;
            const optional = day.places.optional;
            const foodMains = mains.filter(p => ['food', 'nightlife', 'restaurant', 'cafe', 'bar'].includes(p.category) || p._type === 'meal');
            const nonFoodMains = mains.filter(p => !foodMains.includes(p));
            // Check based on our new fields or inference
            const meals = mains.filter(p => p.meal_type || (p.note && p.note.includes('Meal')));

            console.log(`  Mains: ${mains.length} (Food: ${foodMains.length}, Non-Food: ${nonFoodMains.length})`);
            console.log(`  Optional: ${optional.length}`);
            console.log(`  Meals Injected: ${meals.length} (${meals.map(m => `${m.name} [${m.meal_type || m.category}]`).join(', ')})`);

            // Validation Checks
            if (mains.length > 5) console.error("  [FAIL] Too many mains!");
            if (foodMains.length > 2) console.error("  [FAIL] Too many food mains!");
            if (nonFoodMains.length > 3) console.error("  [FAIL] Too many non-food mains!");
            if (meals.length === 0) console.warn("  [WARN] Zero meals on this day.");
        });

    } catch (err) {
        console.error("\n=== FAILURE ===");
        console.error(err.message);
        if (err.statusCode) console.error(`Status: ${err.statusCode}`);
        if (err.stack) console.error(err.stack);
    }
}

testGoaFull();
