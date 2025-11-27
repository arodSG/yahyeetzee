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

    getRedisKey(userId, statType) {
        return `user_stats:${userId}:${statType}`;
    }

    async cacheUserStats(userId, singleStats, multiStats, singleTopScores, multiTopScores) {
        if (!this.client || !this.isConnected) {
            return;
        }

        try {
            const singleStatsKey = this.getRedisKey(userId, 'single');
            const multiStatsKey = this.getRedisKey(userId, 'multi');
            const singleTopScoresKey = this.getRedisKey(userId, 'single_top_scores');
            const multiTopScoresKey = this.getRedisKey(userId, 'multi_top_scores');

            // Cache for 24 hours (86400 seconds)
            const ttl = 24 * 60 * 60;

            await Promise.all([
                this.client.setEx(singleStatsKey, ttl, JSON.stringify(singleStats)),
                this.client.setEx(multiStatsKey, ttl, JSON.stringify(multiStats)),
                this.client.setEx(singleTopScoresKey, ttl, JSON.stringify(singleTopScores)),
                this.client.setEx(multiTopScoresKey, ttl, JSON.stringify(multiTopScores))
            ]);
        } catch (err) {
            console.error('Failed to cache user stats in Redis:', err);
        }
    }

    async getCachedUserStats(userId) {
        if (!this.client || !this.isConnected) {
            return null;
        }

        try {
            const singleStatsKey = this.getRedisKey(userId, 'single');
            const multiStatsKey = this.getRedisKey(userId, 'multi');
            const singleTopScoresKey = this.getRedisKey(userId, 'single_top_scores');
            const multiTopScoresKey = this.getRedisKey(userId, 'multi_top_scores');

            const results = await Promise.all([
                this.client.get(singleStatsKey),
                this.client.get(multiStatsKey),
                this.client.get(singleTopScoresKey),
                this.client.get(multiTopScoresKey)
            ]);

            // If any of the required data is missing, return null to force database lookup
            if (!results[0] || !results[1]) {
                return null;
            }

            return {
                singleStats: JSON.parse(results[0]),
                multiStats: JSON.parse(results[1]),
                singleTopScores: results[2] ? JSON.parse(results[2]) : [],
                multiTopScores: results[3] ? JSON.parse(results[3]) : []
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
            const keys = [
                this.getRedisKey(userId, 'single'),
                this.getRedisKey(userId, 'multi'),
                this.getRedisKey(userId, 'single_top_scores'),
                this.getRedisKey(userId, 'multi_top_scores')
            ];

            await Promise.all(keys.map(key => this.client.del(key)));
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
Object.freeze(instance);
export default instance;
