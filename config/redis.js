const Redis = require("ioredis");

// It is highly recommended to keep your host, port, and password in your .env file
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
  
  // Automatically retry connecting if the network drops
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay; 
  },
  maxRetriesPerRequest: null 
});

redis.on("connect", () => {
  console.log("Connected to Redis server successfully!");
});

// Catch errors to prevent your entire Node app from crashing
redis.on("error", (err) => {
  console.error("Redis connection error:", err.message);
});

module.exports = redis;