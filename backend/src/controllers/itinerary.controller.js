import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import { validateItineraryInput } from "../utils/inputValidator.js";
import { buildPlanningContext } from "../utils/planningContext.js";

const createPlanningContextController = asyncHandler(async (req, res) => {
  const validatedInput = validateItineraryInput(req.body);
  const planningContext = buildPlanningContext(validatedInput);

  return res.status(200).json(
    new ApiResponse(200, planningContext, "Planning context created successfully")
  );
});

export { createPlanningContextController };