import { buildRegionsWithAI } from "../services/aiRegionBuilder.js";
import { fetchRawPlacesForDestination } from "./fetchRawPlacesForDestination.js";
import { getCachedDestination, setCachedDestination } from '../cache/destinationCache.js'

export async function getDestinationContext(destination) {
  const cached = await getCachedDestination(destination);
  if (cached) return cached;

  const rawPlaces = await fetchRawPlacesForDestination(destination);
  const structuredContext = await buildRegionsWithAI(destination, rawPlaces);

  await setCachedDestination(destination, structuredContext);

  return structuredContext;
}
