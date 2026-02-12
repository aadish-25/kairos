import { Router } from "express";
import { createPlanningContext } from "../controllers/itinerary.controller.js";
import rateLimiter from "../middlewares/rateLimiter.middleware.js";

const router = Router();

// POST /api/v1/itinerary/generate
router.post("/generate", rateLimiter(5, 60), createPlanningContext);

export default router;
