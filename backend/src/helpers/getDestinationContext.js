import { buildRegionsWithAI } from "../services/aiRegionBuilder.js";
import { fetchRawPlacesForDestination } from "./fetchRawPlacesForDestination.js";
import redis from "../config/redis.js";

export async function getDestinationContext(destination) {
  const cached = await redis.get(destination);
  if (cached) return JSON.parse(cached);

  const rawPlaces = await fetchRawPlacesForDestination(destination);

  const structuredContext = await buildRegionsWithAI(
    destination,
    rawPlaces
  );

  await redis.set(destination, JSON.stringify(structuredContext), {
    EX: 60 * 60 * 24 * 7,
  });

  return structuredContext;
}
