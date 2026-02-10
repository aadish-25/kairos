import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import { validateItineraryInput } from "../helpers/inputValidator.js";
import { buildPlanningContext } from "../helpers/planningContext.js";
import { decideItineraryShape } from "../helpers/itineraryShaper.js";
import { getDestinationContext } from "../helpers/destinationContextLoader.js";
import { buildDayBuckets } from "../helpers/dayBucketBuilder.js";

const createPlanningContext = asyncHandler(async (req, res) => {
  const validatedInput = validateItineraryInput(req.body);
  const planningContext = buildPlanningContext(validatedInput);

  // Resolve destination
  if (planningContext.constraints.destination) {
    planningContext.destination = {
      status: "RESOLVED",
      value: planningContext.constraints.destination
    };
  } else {
    planningContext.destination = {
      status: "UNRESOLVED",
      value: null
    };
  }

  // Decide next step
  let nextAction;
  let suggestedDestinations = null;
  let destinationContext = null;
  let itineraryShape = null;
  let dayBuckets = null;

  if (planningContext.destination.status === "UNRESOLVED") {
    nextAction = "SUGGEST_DESTINATION"

    // Mock suggestions (AI-ready)
    // In the frontend, when the user selected a destination, we will call the API again with the selected destination
    suggestedDestinations = [
      { "name": "Goa", "reason": "Beaches are great to visit in summers" },
      { "name": "Delhi", "reason": "Historical places" },
      { "name": "Manali", "reason": "Snowfall" }
    ]
  } else {
    nextAction = "GENERATE_ITINERARY"

    // Get destination context
    destinationContext = getDestinationContext(planningContext.destination.value)

    // Decide itinerary shape
    itineraryShape = decideItineraryShape(planningContext.constraints.days, destinationContext);

    // Build day buckets
    dayBuckets = buildDayBuckets(itineraryShape);

  }



  return res.status(200).json(
    new ApiResponse(
      200,
      {
        planningContext,
        suggestedDestinations,
        itineraryShape,
        destinationContext,
        nextAction,
        dayBuckets
      },
      "Planning context created successfully"
    )
  );
});

export { createPlanningContext };

// curl -X POST http://localhost:8000/api/v1/itinerary/generate -H "Content-Type: application/json" -d "{\"days\":3,\"budget\":5000,\"destination\":\"Mahabalipuram\",\"source\":\"Chennai\"}"
// {
//   "statusCode": 200,
//   "data": {
//     "planningContext": {
//       "constraints": {
//         "days": 3,
//         "budget": 5000,
//         "source": "Chennai",
//         "destination": "Mahabalipuram",
//         "preferences": null
//       },
//       "metadata": {
//         "createdAt": "2026-02-10T05:04:18.848Z",
//         "requestType": "ITINERARY_PLANNING"
//       },
//       "destination": {
//         "status": "RESOLVED",
//         "value": "Mahabalipuram"
//       }
//     },
//     "nextAction": "GENERATE_ITINERARY"
//   },
//   "message": "Planning context created successfully",
//   "success": true
// }

// curl -X POST http://localhost:8000/api/v1/itinerary/generate -H "Content-Type: application/json" -d "{\"days\":3,\"budget\":5000,\"source\":\"Chennai\"}"
// {
//   "statusCode": 200,
//   "data": {
//     "planningContext": {
//       "constraints": {
//         "days": 3,
//         "budget": 5000,
//         "source": "Chennai",
//         "destination": null,
//         "preferences": null
//       },
//       "metadata": {
//         "createdAt": "2026-02-10T05:05:06.304Z",
//         "requestType": "ITINERARY_PLANNING"
//       },
//       "destination": {
//         "status": "UNRESOLVED",
//         "value": null
//       }
//     },
//     "nextAction": "SUGGEST_DESTINATION",
//     "suggestedDestinations": [
//       {
//         "name": "Goa",
//         "reason": "Beaches are great to visit in summers"
//       },
//       {
//         "name": "Delhi",
//         "reason": "Historical places"
//       },
//       {
//         "name": "Manali",
//         "reason": "Snowfall"
//       }
//     ]
//   },
//   "message": "Planning context created successfully",
//   "success": true
// }