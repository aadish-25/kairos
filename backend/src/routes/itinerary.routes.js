import { Router } from "express";
import { createPlanningContextController } from "../controllers/itinerary.controller.js";

const router = Router();

// POST /api/v1/itinerary/generate
router.post("/generate", createPlanningContextController);

export default router;