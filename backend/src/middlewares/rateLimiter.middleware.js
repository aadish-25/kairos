import redisClient from "../cache/redisClient.js";
import ApiError from "../utils/ApiError.js";

const rateLimiter = (limit = 10, windowInSeconds = 60) => {
  return async (req, res, next) => {
    const ip = req.ip || req.headers["x-forwarded-for"] || "127.0.0.1";
    const key = `rate_limit:${ip}`;

    try {
      const current = await redisClient.incr(key);

      if (current === 1) {
        // First request in this window, set expiration
        await redisClient.expire(key, windowInSeconds);
      }

      const ttl = await redisClient.ttl(key);

      // Add headers so the frontend knows their limit
      res.setHeader("X-RateLimit-Limit", limit);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, limit - current));
      res.setHeader("X-RateLimit-Reset", ttl);

      if (current > limit) {
        throw new ApiError(
          429,
          "Too many requests. Please try again in a minute.",
        );
      }

      next();
    } catch (error) {
      if (error instanceof ApiError) return next(error);
      console.error("Rate Limiter Error:", error);
      next(); // Fail open so we don't block users if Redis is glitchy
    }
  };
};

export default rateLimiter;
