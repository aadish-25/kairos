import redisClient from "./redisClient.js";

// const DESTINATION_TTL_SECONDS = 60 * 60 * 24 * 7;

function buildDestinationKey(destinationName) {
  return `destination:${destinationName.toLowerCase()}`;
}

async function getCachedDestination(destinationName) {
  const key = buildDestinationKey(destinationName);
  const cached = await redisClient.get(key);

  if (!cached) return null;

  return JSON.parse(cached);
}

async function setCachedDestination(destinationName, destinationContext) {
  const key = buildDestinationKey(destinationName);

  await redisClient.set(key, JSON.stringify(destinationContext), {
    // EX: DESTINATION_TTL_SECONDS,
  });
}

export { getCachedDestination, setCachedDestination };
