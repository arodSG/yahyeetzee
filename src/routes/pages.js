import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { isGameIdValid } from '../utils/Util.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import db from '../utils/DBUtil.js';
import redis from '../utils/RedisUtil.js';
import jwt from 'jsonwebtoken';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let lastWarmup = 0; // timestamp of last warm-up
let lastDuration = 0; // duration of last warm-up (ms)

const WARMUP_INTERVAL = 2 * 60 * 1000; // 2 minutes
const FAST_THRESHOLD = 150;

router.get('/config_public.js', (req, res) => {
    const rootURL = process.env.ROOT_URL;

    let configFile = `
        const configPublic = {
            socket: {
                url: '${rootURL}'
            }
        };
        export default configPublic;
    `;

    res.type('application/javascript').send(configFile);
});

router.get('/', (req, res) => {
    const now = Date.now();

    if(now - lastWarmup > WARMUP_INTERVAL || lastDuration < FAST_THRESHOLD) {
        const start = Date.now();
        console.log('Warming up database...');
        db.executeQuery('SELECT 1')
            .then(() => {
                lastDuration = Date.now() - start;
                lastWarmup = Date.now();
                console.log(`Database warmup finished in ${lastDuration}ms`);
            })
            .catch(err => {
                console.warn('Database warmup failed:', JSON.stringify(err));
            });
    }

    res.sendFile(path.join(__dirname, '../../public/html/home.html'));
});

router.get('/login', (req, res) => {
    const user = req.user;

    if(user) {
        res.redirect('/');
    }
    else {
        res.sendFile(path.join(__dirname, '../../public/html/login.html'));
    }
});

router.get('/play', (req, res) => {
    res.redirect('/');
});

router.get('/play/:gameId', (req, res) => {
    const { gameId } = req.params;
    if(isGameIdValid(gameId)) {
        res.sendFile(path.join(__dirname, '../../public/html/play.html'));
    } else {
        res.redirect('/');
    }
});

router.get('/stats', async (req, res) => {
    try {
        const userQueryParam = req.query.user;
        const loggedInToken = req.cookies.loggedInToken;
        const user = loggedInToken ? jwt.verify(loggedInToken, process.env.JWT_SECRET) : null;
        const username = userQueryParam || (user?.username || null);

        let statsData = null;

        if(username) {
            const dbUser = await db.getUser(username).catch(err => {
                console.warn(`Failed to fetch user ${username}:`, JSON.stringify(err));
            });

            if(dbUser) {
                const userId = dbUser.id;

                // Try to get stats from Redis cache first
                const cachedStats = await redis.getCachedUserStats(userId);
                
                if(cachedStats) {
                    statsData = {
                        username: dbUser.username,
                        singleStats: cachedStats.singleStats,
                        multiStats: cachedStats.multiStats,
                        singleTopScores: cachedStats.singleTopScores,
                        multiTopScores: cachedStats.multiTopScores
                    };
                } else {
                    // If not in cache, fetch from database
                    const singleStatsQuery = db.getSingleStats(userId);
                    const multiStatsQuery = db.getMultiStats(userId);
                    const singleTopScoresQuery = db.getSingleTopScores(userId);
                    const multiTopScoresQuery = db.getMultiTopScores(userId);

                    try {
                        const results = await Promise.all([singleStatsQuery, multiStatsQuery, singleTopScoresQuery, multiTopScoresQuery]);
                        const singleStats = results[0][0] || { bonuses: 0, yahtzees: 0, games: 0, average_score: 0 };
                        const multiStats = results[1][0] || { bonuses: 0, yahtzees: 0, games: 0, average_score: 0, wins: 0 };
                        const singleTopScores = results[2] || [];
                        const multiTopScores = results[3] || [];

                        statsData = {
                            username: dbUser.username,
                            singleStats,
                            multiStats,
                            singleTopScores,
                            multiTopScores
                        };

                        // Cache the stats for future requests
                        await redis.cacheUserStats(userId, singleStats, multiStats, singleTopScores, multiTopScores);
                    } catch(error) {
                        console.log(error);
                    }
                }
            }
        }

        // Render the stats page with injected data
        const statsHtmlPath = path.join(__dirname, '../../public/html/stats.html');
        let html = readFileSync(statsHtmlPath, 'utf-8');
        
        // Inject the stats data as a window variable before the stats.js script loads
        const statsDataScript = `<script>
            window.injectedStatsData = ${JSON.stringify(statsData)};
        </script>`;

        html = html.replace('</head>', `${statsDataScript}\n    </head>`);
        res.send(html);
    } catch(error) {
        console.error('Error in /stats route:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/leaderboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/html/leaderboard.html'));
});

router.get('/resetpassword', authMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/html/resetpassword.html'));
});

export default router;