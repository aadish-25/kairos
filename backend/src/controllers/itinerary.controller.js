import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import { validateItineraryInput } from "../utils/inputValidator.js";

const generateItineraryController = asyncHandler(async (req, res) => {
  const validatedInput = validateItineraryInput(req.body);

  return res.status(200).json(
    new ApiResponse(200, validatedInput, "Input validated successfully")
  );
});

export { generateItineraryController };