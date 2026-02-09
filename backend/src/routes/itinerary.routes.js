import { Router } from "express";
import { generateItineraryController } from "../controllers/itinerary.controller.js";

const router = Router();

// POST /api/v1/itinerary/generate
router.post("/generate", generateItineraryController);

export default router;