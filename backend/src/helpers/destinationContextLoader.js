import destinations from "../data/destinations.json" assert { type: "json" };
import ApiError from "../utils/ApiError.js";

function getDestinationContext(destinationName) {
    if (!destinationName || typeof destinationName !== "string") {
        throw new ApiError(400, "Destination name is required");
    }

    const destination = destinations[destinationName.toLowerCase().trim()]
    if (!destination) throw new ApiError(404, "Destination information not found")

    return destination
}

export { getDestinationContext }

// Sample output (getDestinationContext("goa")):
// {
//   name: "Goa",
//   type: "state",
//   regions: [
//     {
//       id: "north_goa",
//       name: "North Goa",
//       character: ["beaches", "nightlife"],
//       density: "high",
//       recommended_days: 2,
//       places: [
//         { name: "Baga Beach", type: "attraction", short_description: "...", tags: [...], priority: "main" },
//         { name: "Anjuna Flea Market", type: "experience", ... },
//         ...
//       ]
//     },
//     { id: "central_goa", name: "Central Goa", ... },
//     { id: "south_goa", name: "South Goa", ... }
//   ],
//   travel_profile: {
//     spread: "wide",
//     needs_split_stay: true,
//     min_days: 2,
//     ideal_days: 4
//   }
// }