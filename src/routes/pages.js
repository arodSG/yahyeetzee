import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { isGameIdValid } from '../utils/Util.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import db from '../utils/DBUtil.js';

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

router.get('/stats', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/html/stats.html'));
});

router.get('/leaderboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/html/leaderboard.html'));
});

router.get('/resetpassword', authMiddleware, (req, res) => {
    res.sendFile(path.join(__dirname, '../../public/html/resetpassword.html'));
});

export default router;