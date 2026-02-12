import express from "express";
import cors from "cors";
import helmet from "helmet";

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// Routes import
import itineraryRouter from "./routes/itinerary.routes.js";
import healthRouter from "./routes/health.routes.js";
import docRouter from "./routes/docs.routes.js";

// Routes declaration
app.use("/api/v1/itinerary", itineraryRouter);
app.use("/api/v1/health", healthRouter);
app.use("/api/v1/docs", docRouter);

// Global Error Middleware
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    errors: err.errors || [],
  });
});

export default app;
