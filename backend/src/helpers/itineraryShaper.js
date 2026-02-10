import ApiError from "../utils/ApiError.js";

function decideItineraryShape(days, destinationContext) {
    if (!days || typeof days !== "number" || days <= 0) {
        throw new ApiError(400, "Invalid number of days");
    }

    if (!destinationContext || !destinationContext.regions) {
        throw new ApiError(500, "Invalid destination context");
    }

    const { regions, travel_profile } = destinationContext;

    // Decide stay type
    let stay_type = "single";
    if (travel_profile?.spread === "wide" && days > 3) {
        stay_type = "split";
    }

    // Sort regions by recommended_days (descending)
    const sortedRegions = [...regions].sort(
        (a, b) => b.recommended_days - a.recommended_days
    );

    let remainingDays = days;
    const regions_plan = [];

    for (const region of sortedRegions) {
        if (remainingDays <= 0) break;

        const allocatedDays = Math.min(
            region.recommended_days,
            remainingDays
        );

        regions_plan.push({
            region_id: region.id,
            region_name: region.name,
            days: allocatedDays,
            stay_required: stay_type === "split"
        });

        remainingDays -= allocatedDays;
    }

    // Single stay correction
    if (stay_type === "single" && regions_plan.length > 0) {
        regions_plan[0].stay_required = true;
        for (let i = 1; i < regions_plan.length; i++) {
            regions_plan[i].stay_required = false;
        }
    }

    return {
        total_days: days,
        stay_type,
        regions_plan
    };
}

export { decideItineraryShape };

// ===== Sample Output =====

// decideItineraryShape(3, goaContext)
// Goa has: North (rec 2), Central (rec 1), South (rec 2) → total 5, user wants 3 → shrink
// {
//   total_days: 3,
//   stay_type: "single",          // spread is "wide" but days <= 3, so single
//   regions_plan: [
//     { region_id: "north_goa",   region_name: "North Goa",    days: 2, stay_required: true },
//     { region_id: "south_goa",   region_name: "South Goa",    days: 1, stay_required: false },
//     // Central Goa dropped — no remaining days
//   ]
// }

// decideItineraryShape(3, manaliContext)
// Manali has: Old Manali (rec 1), Mall Road (rec 1), Solang (rec 1) → total 3, user wants 3 → exact fit
// {
//   total_days: 3,
//   stay_type: "single",          // spread is "compact", so always single
//   regions_plan: [
//     { region_id: "old_manali",     region_name: "Old Manali",            days: 1, stay_required: true },
//     { region_id: "manali_town",    region_name: "Mall Road & Town",      days: 1, stay_required: false },
//     { region_id: "solang_rohtang", region_name: "Solang Valley & Rohtang", days: 1, stay_required: false }
//   ]
// }
