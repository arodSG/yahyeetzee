import { createClient } from 'redis';

class RedisUtil {
    constructor() {
        this.isEnabled = !!process.env.REDIS_URL;
        if (!this.isEnabled) {
            console.warn('REDIS_URL environment variable not set. Redis caching will be disabled.');
        }
    }

    createConnection() {
        return createClient({ url: process.env.REDIS_URL });
    }

    async withConnection(callback) {
        if (!this.isEnabled) {
            return null;
        }

        const client = this.createConnection();

        try {
            await client.connect();
            console.log('Connected to Redis');
            const result = await callback(client);
            return result;
        } catch (err) {
            console.error('Redis operation error:', err);
            return null;
        } finally {
            try {
                await client.disconnect();
                console.log('Disconnected from Redis');
            } catch (disconnectErr) {
                console.error('Error disconnecting from Redis:', disconnectErr);
            }
        }
    }

    getRedisKey(userId) {
        return `user_stats:${userId}`;
    }

    async cacheUserStats(userId, singleStats, multiStats, singleTopScores, multiTopScores) {
        await this.withConnection(async (client) => {
            try {
                const key = this.getRedisKey(userId);
                const ttlDays = 30;
                const ttl = ttlDays * 24 * 60 * 60;

                const payload = JSON.stringify({
                    singleStats,
                    multiStats,
                    singleTopScores,
                    multiTopScores
                });

                await client.setEx(key, ttl, payload);
                console.log(`Redis: cached stats for user ${userId}`);
            } catch (err) {
                console.error('Failed to cache user stats in Redis:', err);
            }
        });
    }

    async getCachedUserStats(userId) {
        return await this.withConnection(async (client) => {
            try {
                const key = this.getRedisKey(userId);
                const raw = await client.get(key);

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
        });
    }

    async invalidateUserStatsCache(userId) {
        await this.withConnection(async (client) => {
            try {
                const key = this.getRedisKey(userId);
                await client.del(key);
                console.log(`Redis: invalidated cache for user ${userId}`);
            } catch (err) {
                console.error('Failed to invalidate user stats cache:', err);
            }
        });
    }

    async isHealthy() {
        return await this.withConnection(async (client) => {
            try {
                await client.ping();
                return true;
            } catch (err) {
                console.error('Redis health check failed:', err);
                return false;
            }
        });
    }

    async disconnect() {
        // No-op: connections are managed per-operation via withConnection()
    }
}

const instance = new RedisUtil();
export default instance;
