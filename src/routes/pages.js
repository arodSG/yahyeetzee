import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { isGameIdValid } from '../utils/Util.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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