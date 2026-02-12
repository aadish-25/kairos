import { Router } from "express";
import { getDocs } from "../controllers/docs.controller.js";

const router = Router();

// GET /api/v1/docs
router.get("/", getDocs);

export default router;
