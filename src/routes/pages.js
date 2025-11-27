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

        const statsHtmlPath = path.join(__dirname, '../../public/html/stats.html');
        let html = readFileSync(statsHtmlPath, 'utf-8');

        if(statsData) {
            const { username, singleStats, multiStats, singleTopScores, multiTopScores } = statsData;
            const s = singleStats || {};
            const m = multiStats || {};
            const headingText = username.toLowerCase().endsWith('s') ? `${username}' Stats` : `${username}'s Stats`;
            html = html.replace('{{HEADING}}', headingText);

            html = html.replace('{{SINGLE_GAMES}}', s.games ?? '-');
            html = html.replace('{{SINGLE_BONUSES}}', s.bonuses ?? '-');
            html = html.replace('{{SINGLE_YAHTZEES}}', s.yahtzees ?? '-');
            html = html.replace('{{SINGLE_AVERAGE}}', s.average_score ?? '-');

            html = html.replace('{{MULTI_GAMES}}', m.games ?? '-');
            html = html.replace('{{MULTI_BONUSES}}', m.bonuses ?? '-');
            html = html.replace('{{MULTI_YAHTZEES}}', m.yahtzees ?? '-');
            html = html.replace('{{MULTI_AVERAGE}}', m.average_score ?? '-');
            html = html.replace('{{MULTI_WINS}}', m.wins ?? '-');

            // Calculate and replace percentages for tooltips
            const calcPercent = (numerator, denominator) => {
                return denominator > 0 ? ((numerator / denominator) * 100).toFixed(0) : '';
            };

            html = html.replace('{{SINGLE_BONUSES_PCT}}', calcPercent(s.bonuses, s.games));
            html = html.replace('{{SINGLE_YAHTZEES_PCT}}', calcPercent(s.yahtzees, s.games));
            html = html.replace('{{MULTI_BONUSES_PCT}}', calcPercent(m.bonuses, m.games));
            html = html.replace('{{MULTI_YAHTZEES_PCT}}', calcPercent(m.yahtzees, m.games));
            html = html.replace('{{MULTI_WINS_PCT}}', calcPercent(m.wins, m.games));

            const renderTopScoresRows = (scores) => {
                return scores.map((s, i) => {
                    const d = new Date(s.created_date);
                    const date = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear().toString().slice(-2)}`;
                    return `<tr><th class="col" scope="row">${i + 1}</th><td class="col">${s.score}</td><td class="col">${date}</td></tr>`;
                }).join('');
            };

            if(singleTopScores && singleTopScores.length > 0) {
                html = html.replace('{{SINGLE_TOP_SCORES_ROWS}}', renderTopScoresRows(singleTopScores));
                html = html.replace('{{SINGLE_TABLE_VISIBILITY}}', '');
                html = html.replace('{{SINGLE_NO_GAMES_VISIBILITY}}', 'd-none');
            } else {
                html = html.replace('{{SINGLE_TOP_SCORES_ROWS}}', '');
                html = html.replace('{{SINGLE_TABLE_VISIBILITY}}', 'd-none');
                html = html.replace('{{SINGLE_NO_GAMES_VISIBILITY}}', '');
            }

            if(multiTopScores && multiTopScores.length > 0) {
                html = html.replace('{{MULTI_TOP_SCORES_ROWS}}', renderTopScoresRows(multiTopScores));
                html = html.replace('{{MULTI_TABLE_VISIBILITY}}', '');
                html = html.replace('{{MULTI_NO_GAMES_VISIBILITY}}', 'd-none');
            } else {
                html = html.replace('{{MULTI_TOP_SCORES_ROWS}}', '');
                html = html.replace('{{MULTI_TABLE_VISIBILITY}}', 'd-none');
                html = html.replace('{{MULTI_NO_GAMES_VISIBILITY}}', '');
            }
        } else {
            html = html.replace('{{HEADING}}', 'Stats');
            html = html.replace('{{SINGLE_GAMES}}', '-');
            html = html.replace('{{SINGLE_BONUSES}}', '-');
            html = html.replace('{{SINGLE_YAHTZEES}}', '-');
            html = html.replace('{{SINGLE_AVERAGE}}', '-');
            html = html.replace('{{MULTI_GAMES}}', '-');
            html = html.replace('{{MULTI_BONUSES}}', '-');
            html = html.replace('{{MULTI_YAHTZEES}}', '-');
            html = html.replace('{{MULTI_AVERAGE}}', '-');
            html = html.replace('{{MULTI_WINS}}', '-');
            html = html.replace('{{SINGLE_TOP_SCORES_ROWS}}', '');
            html = html.replace('{{SINGLE_TABLE_VISIBILITY}}', 'd-none');
            html = html.replace('{{SINGLE_NO_GAMES_VISIBILITY}}', '');
            html = html.replace('{{MULTI_TOP_SCORES_ROWS}}', '');
            html = html.replace('{{MULTI_TABLE_VISIBILITY}}', 'd-none');
            html = html.replace('{{MULTI_NO_GAMES_VISIBILITY}}', '');
        }

        res.send(html);
    } catch(error) {
        console.error('Error in /stats route:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.get('/leaderboard', async (req, res) => {
    try {
        const singleScoresQuery = db.getSingleLeaderboard();
        const multiScoresQuery = db.getMultiLeaderboard();

        const results = await Promise.all([singleScoresQuery, multiScoresQuery]);
        const singleScores = results[0] || [];
        const multiScores = results[1] || [];

        const leaderboardHtmlPath = path.join(__dirname, '../../public/html/leaderboard.html');
        let html = readFileSync(leaderboardHtmlPath, 'utf-8');

        const renderLeaderboardRows = (scores) => scores.map((row, idx) => {
            const name = row.username;
            const score = row.score;
            const d = new Date(row.created_date);
            const date = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear().toString().slice(-2)}`;
            const link = `/stats?user=${encodeURIComponent(name)}`;
            return `<tr><th scope="row">${idx + 1}</th><td><a class="fst-italic" href="${link}">${escapeHtml(name)}</a></td><td>${score}</td><td>${date}</td></tr>`;
        }).join('');

        const singleRows = renderLeaderboardRows(singleScores);
        const multiRows = renderLeaderboardRows(multiScores);

        html = html.replace('{{SINGLE_LEADERBOARD_ROWS}}', singleRows);
        html = html.replace('{{MULTI_LEADERBOARD_ROWS}}', multiRows);

        // Visibility classes
        if (singleRows.length) {
            html = html.replace('{{SINGLE_TABLE_VISIBILITY}}', '');
            html = html.replace('{{SINGLE_NO_GAMES_VISIBILITY}}', 'd-none');
        } else {
            html = html.replace('{{SINGLE_TABLE_VISIBILITY}}', 'd-none');
            html = html.replace('{{SINGLE_NO_GAMES_VISIBILITY}}', '');
        }

        if (multiRows.length) {
            html = html.replace('{{MULTI_TABLE_VISIBILITY}}', '');
            html = html.replace('{{MULTI_NO_GAMES_VISIBILITY}}', 'd-none');
        } else {
            html = html.replace('{{MULTI_TABLE_VISIBILITY}}', 'd-none');
            html = html.replace('{{MULTI_NO_GAMES_VISIBILITY}}', '');
        }

        res.send(html);
    } catch (error) {
        console.error('Error in /leaderboard route:', error);
        res.status(500).send('Internal Server Error');
    }
});

/** Escape HTML to prevent injection in leaderboard names */
function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
}

router.get('/resetpassword', authMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/html/resetpassword.html'));
});

export default router;