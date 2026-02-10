import { Router } from "express";
import { createPlanningContext } from "../controllers/itinerary.controller.js";

const router = Router();

// POST /api/v1/itinerary/generate
router.post("/generate", createPlanningContext);

export default router;