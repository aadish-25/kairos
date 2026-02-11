import ApiError from "../utils/ApiError.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiResponse from "../utils/ApiResponse.js";
import redisClient from "../cache/redisClient.js";
import axios from "axios";

export const checkHealth = asyncHandler(async (req, res) => {
    const healthStatus = {
        server: "UP",
        redis: "DOWN",
        aiService: "DOWN",
        timestamp: new Date().toISOString(),
    };

    // Check Redis
    try {
        const redisPing = await redisClient.ping();
        if (redisPing === "PONG") healthStatus.redis = "UP";
    } catch (error) {
        console.error("Health Check Error (Redis):", error.message);
    }

    //   Check AI Service
    try {
        const aiRes = await axios.get("http://localhost:9000/health", {
            timeout: 2000,
        });
        if (aiRes.status === 200 && aiRes.data.status === "ok") {
            healthStatus.aiService = "UP";
        }
    } catch (error) {
        console.error("Health Check Error (AI):", error.message);
    }

    const statusCode =
        healthStatus.redis === "UP" && healthStatus.aiService === "UP" ? 200 : 503;

    return res
        .status(statusCode)
        .json(new ApiResponse(statusCode, healthStatus, "Health check complete"));
});
