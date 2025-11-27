import { createClient } from 'redis';

class RedisUtil {
    constructor() {
        this.client = null;
        this.isConnected = false;
        this.initializeClient();
    }

    async initializeClient() {
        if (!process.env.REDIS_URL) {
            console.warn('REDIS_URL environment variable not set. Redis caching will be disabled.');
            return;
        }

        try {
            this.client = createClient({ url: process.env.REDIS_URL });

            this.client.on('error', (err) => {
                console.error('Redis client error:', err);
                this.isConnected = false;
            });

            this.client.on('connect', () => {
                console.log('Connected to Redis');
                this.isConnected = true;
            });

            this.client.on('disconnect', () => {
                console.log('Disconnected from Redis');
                this.isConnected = false;
            });

            await this.client.connect();
        } catch (err) {
            console.error('Failed to initialize Redis client:', err);
            this.client = null;
        }
    }

    getRedisKey(userId) {
        return `user_stats:${userId}`;
    }

    async cacheUserStats(userId, singleStats, multiStats, singleTopScores, multiTopScores) {
        if (!this.client || !this.isConnected) {
            return;
        }

        try {
            const key = this.getRedisKey(userId);

            // Cache for 24 hours (86400 seconds)
            const ttl = 24 * 60 * 60;

            const payload = JSON.stringify({
                singleStats,
                multiStats,
                singleTopScores,
                multiTopScores
            });

            await this.client.setEx(key, ttl, payload);
            console.log(`Redis: cached stats for user ${userId}`);
        } catch (err) {
            console.error('Failed to cache user stats in Redis:', err);
        }
    }

    async getCachedUserStats(userId) {
        if (!this.client || !this.isConnected) {
            return null;
        }

        try {
            const key = this.getRedisKey(userId);
            const raw = await this.client.get(key);

            if (!raw) {
                console.log(`Redis: cache miss for user ${userId}`);
                return null;
            }

            const parsed = JSON.parse(raw);
            console.log(`Redis: cache hit for user ${userId}`);

            // Validate presence of core stats; fall back to DB if missing
            if (!parsed.singleStats || !parsed.multiStats) {
                return null;
            }

            return {
                singleStats: parsed.singleStats,
                multiStats: parsed.multiStats,
                singleTopScores: parsed.singleTopScores || [],
                multiTopScores: parsed.multiTopScores || []
            };
        } catch (err) {
            console.error('Failed to retrieve cached user stats from Redis:', err);
            return null;
        }
    }

    async invalidateUserStatsCache(userId) {
        if (!this.client || !this.isConnected) {
            return;
        }

        try {
            const key = this.getRedisKey(userId);
            await this.client.del(key);
            console.log(`Redis: invalidated cache for user ${userId}`);
        } catch (err) {
            console.error('Failed to invalidate user stats cache:', err);
        }
    }

    async isHealthy() {
        if (!this.client) {
            return false;
        }

        try {
            await this.client.ping();
            return true;
        } catch (err) {
            console.error('Redis health check failed:', err);
            return false;
        }
    }

    async disconnect() {
        if (this.client && this.isConnected) {
            try {
                await this.client.disconnect();
            } catch (err) {
                console.error('Error disconnecting from Redis:', err);
            }
        }
    }
}

const instance = new RedisUtil();
export default instance;
