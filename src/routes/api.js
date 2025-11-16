import { Router } from 'express';
import db from '../utils/DBUtil.js';
import jwt from 'jsonwebtoken';

const router = Router();

router.get('/get-stats', async(req, res) => {
    const userQueryParam = req.query.user;
    const loggedInToken = req.cookies.loggedInToken;
    const user = loggedInToken ? jwt.verify(loggedInToken, process.env.JWT_SECRET) : null;
    const username = userQueryParam || (user?.username || null);

    if(username) {
        const user = await db.getUser(username).catch(err => {
            console.warn(`Failed to fetch user ${username}:`, JSON.stringify(err));
        });

        if(user) {
            const userId = user.id;
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
                res.json({ status: 200, username: user.username, singleStats, multiStats, singleTopScores, multiTopScores });
            } catch(error) {
                console.log(error);
                res.status(500).json({ status: 500, error: 'Failed to fetch stats' });
            }
        }
        else {
            res.status(500).json({ status: 500, error: 'Failed to load user info' });
        }
    }
    else {
        res.status(500).json({ status: 500, error: 'Failed to load user info' });
    }
});

router.get('/get-leaderboard', async(req, res) => {
    const singleScoresQuery = db.getSingleLeaderboard();
    const multiScoresQuery = db.getMultiLeaderboard();

    try {
        const results = await Promise.all([singleScoresQuery, multiScoresQuery]);
        const singleScores = results[0] || [];
        const multiScores = results[1] || [];
        res.json({ status: 200, singleScores, multiScores });
    } catch (error) {
        console.log(error);
        res.status(500).json({ status: 500, error: 'Failed to fetch leaderboard' });
    }
});

export default router;