import { buildRegionsWithAI } from "../services/aiRegionBuilder.js";
import { fetchRawPlacesForDestination } from "./fetchRawPlacesForDestination.js";
import { getCachedDestination, setCachedDestination } from '../cache/destinationCache.js'

import { hydrateDestinationContext } from "./hydratePlaces.js";

export async function getDestinationContext(destination) {
  const cached = await getCachedDestination(destination);
  if (cached) return cached;

  const rawPlaces = await fetchRawPlacesForDestination(destination);

  if (!rawPlaces || rawPlaces.length === 0) {
    return {
      destination,
      regions: [],
      message: "No tourism data found for this location."
    };
  }

  const structuredContext = await buildRegionsWithAI(destination, rawPlaces);

  // Hydrate with Lat/Lon from raw data
  hydrateDestinationContext(structuredContext, rawPlaces);

  await setCachedDestination(destination, structuredContext);

  return structuredContext;
}
