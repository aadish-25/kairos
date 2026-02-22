import redisClient from "./redisClient.js";

function buildFetchProfileKey(destinationName) {
    return `fetch_profile:${destinationName.toLowerCase().trim()}`;
}

async function getCachedFetchProfile(destinationName) {
    const key = buildFetchProfileKey(destinationName);
    const cached = await redisClient.get(key);

    if (!cached) return null;

    return JSON.parse(cached);
}

async function setCachedFetchProfile(destinationName, fetchProfile) {
    const key = buildFetchProfileKey(destinationName);

    // No TTL — destination identity (what types of places matter) never changes
    await redisClient.set(key, JSON.stringify(fetchProfile));
}

export { getCachedFetchProfile, setCachedFetchProfile };
