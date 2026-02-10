import redisClient from "./redisClient.js";

await redisClient.set("test:key", "hello redis");
const value = await redisClient.get("test:key");

console.log("Redis value:", value);

process.exit(0);
