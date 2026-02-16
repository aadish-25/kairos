import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import { validateItineraryInput } from "../helpers/inputValidator.js";
import { buildPlanningContext } from "../helpers/planningContext.js";
import { decideItineraryShape } from "../helpers/itineraryShaper.js";
import { buildDayBuckets } from "../helpers/dayBucketBuilder.js";
import { allocatePlacesToDayBuckets } from "../helpers/placeAllocator.js";
import { getDestinationContext } from "../helpers/getDestinationContext.js";

const createPlanningContext = asyncHandler(async (req, res) => {
  const validatedInput = validateItineraryInput(req.body);
  const planningContext = buildPlanningContext(validatedInput);

  // Resolve destination
  planningContext.destination = planningContext.constraints.destination
    ? { status: "RESOLVED", value: planningContext.constraints.destination }
    : { status: "UNRESOLVED", value: null };

  let nextAction;
  let suggestedDestinations = null;
  let destinationContext = null;
  let itineraryShape = null;
  let dayBuckets = null;
  let dayPlans = null;

  // If destination is not provided, suggest destinations
  if (planningContext.destination.status === "UNRESOLVED") {
    nextAction = "SUGGEST_DESTINATION";

    // Mock suggestions (AI-ready)
    // Frontend will re-call this API with the selected destination
    suggestedDestinations = [
      { name: "Goa", reason: "Beaches are great to visit in summers" },
      { name: "Delhi", reason: "Historical places" },
      { name: "Manali", reason: "Snowfall" },
    ];
  }

  // If destination is provided, generate itinerary
  if (planningContext.destination.status === "RESOLVED") {
    nextAction = "GENERATE_ITINERARY";

    // Resolve destination context (Redis → Overpass → AI → cache)
    destinationContext = await getDestinationContext(
      planningContext.destination.value,
    );

    // Decide itinerary shape
    itineraryShape = decideItineraryShape(
      planningContext.constraints.days,
      destinationContext,
    );

    // Build day buckets
    dayBuckets = buildDayBuckets(itineraryShape);

    // Allocate places to day buckets
    dayPlans = allocatePlacesToDayBuckets(dayBuckets, destinationContext);
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
        dayBuckets,
        dayPlans,
      },
      "Planning context created successfully",
    ),
  );
});

export { createPlanningContext };
