import redisClient from "./redisClient.js";

async function clearDestinationCache() {
  const pattern = "destination:*";
  const keys = await redisClient.keys(pattern);

  if (!keys || keys.length === 0) {
    console.log("[Redis] No destination cache keys to clear.");
    return;
  }

  await redisClient.del(keys);
  console.log(`[Redis] Cleared ${keys.length} destination cache keys.`);
}

clearDestinationCache()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("[Redis] Error clearing destination cache:", err);
    process.exit(1);
  });


