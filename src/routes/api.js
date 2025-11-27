import { Router } from 'express';
import db from '../utils/DBUtil.js';

const router = Router();

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