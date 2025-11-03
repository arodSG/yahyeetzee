import express from 'express';
import { Server } from 'socket.io';
import { instrument } from '@socket.io/admin-ui';
import 'dotenv/config'
import passport from 'passport';
import './src/utils/passportConfig.js';
import session from 'express-session';
import mysql from 'mysql2';
import MySQLStore from 'express-mysql-session';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import bcrypt from 'bcryptjs';

import pagesRoutes from './src/routes/pages.js';
import apiRoutes from './src/routes/api.js';
import authRoutes from './src/routes/auth.js';
import db from './src/utils/DBUtil.js';
import Game from './src/models/Game.js';
import { ALL_GAMES, OPEN_GAME_IDS, isGameIdValid, generateGameId, getOpenRoomInfo, removeOpenGameId, isDisplayNameValid, isRoomNameAvailable } from './src/utils/Util.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
}).promise();
const sessionStore = new MySQLStore({}, pool);
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore, // Using MySQL session store for persistence
    cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 365 * 5 // 5 years
    }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(__dirname + '/public'));
app.use('/public', express.static(__dirname + '/public'));
app.use('/bootstrap', express.static(__dirname + '/node_modules/bootstrap/dist/'));
app.use('/icons', express.static(__dirname + '/node_modules/bootstrap-icons/icons'));
app.use('/icons-font', express.static(__dirname + '/node_modules/bootstrap-icons/font'));

app.use('/', pagesRoutes);
app.use('/api', apiRoutes);
app.use('/auth', authRoutes);

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
    cors: { // Documentation: https://socket.io/docs/v3/handling-cors/
        origin: [process.env.ROOT_URL, 'https://admin.socket.io'],
        methods: ['GET', 'POST'],
        credentials: true
    }
});

const hashedAdminPassword = await bcrypt.hash(process.env.SOCKET_ADMIN_PASS, 10);

instrument(io, {
    auth: {
        type: 'basic',
        username: process.env.SOCKET_ADMIN_USER,
        password: hashedAdminPassword
    },
    readonly: true
});

httpServer.listen(process.env.SERVER_PORT);
console.log(`Server started on port ${process.env.SERVER_PORT}`);

io.engine.use(sessionMiddleware);

io.sockets.on('connection', async function(socket) {
    let user = null;

    if(socket.request.session.passport?.user) {
        const userId = socket.request.session.passport.user;
        user = await db.getUserById(userId);
        console.log(`${user.username} connected (socket: ${socket.id})`);
        socket.emit('authenticatedUserConnected', { username: user.username });
    } else {
        console.log(`Unauthenticated user connected (socket: ${socket.id})`);
        socket.emit('unauthenticatedUserConnected');
    }

    socket.on('getUUID', function() {
        const uuid = uuidv4();
        socket.emit('setUUID', { uuid });
    });

    socket.on('updateSocketId', function(data) {
        const gameId = data.gameId;
        const uuid = data.uuid;

        if(isGameIdValid(gameId)) {
            const game = ALL_GAMES[gameId];
            game.updatePlayerIds(uuid, socket.id, user?.id);
        }
    });

    socket.on('getOpenRoomInfo', () => {
        socket.emit('updateOpenRooms', { rooms: getOpenRoomInfo() });
    });

    socket.on('createRoomRequest', function(data) {
        const maxPlayers = data.maxPlayers >= 1 && data.maxPlayers <= 6 ? data.maxPlayers : (data.maxPlayers > 6 ? 6 : 1);
        const leaderUUID = data.uuid; // TODO: validate leaderUUID is a valid UUID
        const leaderDisplayName = (maxPlayers === 1 ? (user?.username || 'Guest') : data.displayName || '').trim();

        if(isDisplayNameValid(leaderDisplayName)) {
            if(isRoomNameAvailable(leaderDisplayName)) {
                const gameId = generateGameId();
                const game = new Game(io, gameId, maxPlayers, leaderUUID);
                game.addStartingPlayer(game.leaderUUID, socket.id, user?.id, leaderDisplayName);
                ALL_GAMES[gameId] = game;
                socket.emit('createRoomResponse', { gameId });

                if(!game.isSinglePlayer) {
                    OPEN_GAME_IDS.push(gameId);
                    socket.broadcast.emit('updateOpenRooms', { rooms: getOpenRoomInfo() });
                }
            }
            else {
                socket.emit('createRoomResponse', { error: 'Display name already in use' });
            }
        }
        else {
            socket.emit('createRoomResponse', { error: 'Invalid display name' });
        }
    });

    socket.on('joinRoomRequest', function(data) {
        const gameId = data.gameId;
        const displayName = (data.displayName || '').trim();
        const game = ALL_GAMES[gameId];

        if(game) {
            if(isDisplayNameValid(displayName)) {
                const playerDisplayNames = game.getPlayerDisplayNames();

                if(!playerDisplayNames.includes(displayName)) {
                    socket.emit('joinRoomResponse', { gameId });
                }
                else {
                    socket.emit('joinRoomResponse', { error: 'Display name already in use' });
                }
            }
            else {
                socket.emit('joinRoomResponse', { error: 'Invalid display name' });
            }
        }
        else {
            socket.emit('joinRoomResponse', { error: 'Room no longer exists' });
        }
    });

    socket.on('joinRoom', function(data) {
        const gameId = data.gameId;
        const uuid = data.uuid;
        const displayName = (data.displayName || '').trim();

        if(isGameIdValid(gameId) && isDisplayNameValid(displayName)) {
            const game = ALL_GAMES[gameId];

            socket.join(gameId);

            if(game.isWaiting && !game.isMaxPlayersAdded()) { // also check if userId is already in player list
                game.addStartingPlayer(uuid, socket.id, user?.id, displayName);
                socket.broadcast.emit('updateOpenRooms', { rooms: getOpenRoomInfo() });
                io.sockets.to(gameId).emit('updateWaitingPlayers', { displayNames: game.getPlayerDisplayNames(), maxPlayers: game.maxPlayers });
            }

            if(uuid === game.leaderUUID) {
                socket.emit('updateLeaderUI');
            }
        }
    });

    socket.on('checkGameId', data => {
        const gameId = data.gameId;

        if(isGameIdValid(gameId)) {
            const game = ALL_GAMES[gameId];
            socket.emit('initGame', { gameId, isSinglePlayer: game.isSinglePlayer, isWaiting: game.isWaiting, inProgress: game.inProgress, isGameOver: game.isGameOver });
        }
    });

    socket.on('getGameInfo', data => {
        const gameId = data.gameId;

        if(isGameIdValid(gameId)) {
            const game = ALL_GAMES[gameId];
            const turnPlayer = game.players.get(game.turnUUID);

            socket.join(gameId);

            const allPlayerDisplayNames = [];
            const allPlayerScoreInfo = [];

            game.players.forEach(player => {
                allPlayerDisplayNames.push(player.displayName);
                allPlayerScoreInfo.push({ displayName: player.displayName, scoreVals: player.scorecard.scoreVals, totalScore: player.scorecard.totalScore });
            });

            socket.emit('refreshGameInfo', {
                allPlayerDisplayNames,
                allPlayerScoreInfo,
                turnSocketId: turnPlayer?.socketId,
                turnDisplayName: turnPlayer?.displayName,
                rolledDice: game.diceToRoll,
                keptDice: game.keptDiceVals,
                rollsRemaining: game.rollsRemainingInTurn,
                possibleScores: game.possibleScores,
                isSinglePlayer: game.isSinglePlayer,
                logMessages: game.logMessages,
                inProgress: game.inProgress,
                winnerDisplayName: game.winner?.displayName
            });
        }
    });

    socket.on('startGame', data => {
        const gameId = data.gameId;
        const uuid = data.uuid;

        if(isGameIdValid(gameId)) {
            const game = ALL_GAMES[gameId];
            
            if(!game.inProgress && uuid === game.leaderUUID && game.verifySocketUUID(socket.id, uuid)) {
                game.startGame();

                if(game.isSinglePlayer) {
                    socket.join(gameId);
                }

                if(game.maxPlayers > 1) { // if game was initially setup as a multiplayer room
                    removeOpenGameId(gameId);
                    socket.broadcast.emit('updateOpenRooms', { rooms: getOpenRoomInfo() });
                }

                const logMessageInfo = { message: 'Game started' };
                game.addLogMessage(logMessageInfo);
                io.sockets.to(gameId).emit('logMessageAdded', logMessageInfo);

                const turnPlayer = game.players.get(game.turnUUID);
                io.sockets.to(gameId).emit('gameStarted', { displayNames: game.getPlayerDisplayNames() });
                io.sockets.to(gameId).emit('startTurn', { turnSocketId: turnPlayer.socketId, turnDisplayName: turnPlayer.displayName, rollsRemaining: game.rollsRemainingInTurn, isSinglePlayer: game.isSinglePlayer });
            }
        }
    });

    socket.on('rollDice', data => {
        const gameId = data.gameId;
        const uuid = data.uuid;

        if(isGameIdValid(gameId)) {
            const game = ALL_GAMES[gameId];
            const diceToRoll = game.diceToRoll;
            const turnPlayer = game.players.get(game.turnUUID);

            if(game.verifySocketUUID(socket.id, uuid) && socket.id === turnPlayer.socketId && game.rollsRemainingInTurn > 0 && Object.keys(diceToRoll).length > 0) {
                game.rollDice();
                if(game.isYahtzee) {
                    const logMessageInfo = { playerName: turnPlayer.displayName, scoreCategory: 'yahtzee' };
                    game.addLogMessage(logMessageInfo);
                    // io.sockets.to(gameId).emit('logMessageAdded', logMessageInfo);
                }
                io.sockets.to(gameId).emit('diceRolled', { turnSocketId: turnPlayer.socketId, turnDisplayName: turnPlayer.displayName, diceToRoll, rollsRemaining: game.rollsRemainingInTurn, possibleScores: game.possibleScores, isYahtzee: game.isYahtzee });
            }
        }
    });

    socket.on('diceClicked', function(data) {
        const gameId = data.gameId;
        const uuid = data.uuid;
        const diceId = data.diceId;

        if(isGameIdValid(gameId)) {
            const game = ALL_GAMES[gameId];
            const turnPlayer = game.players.get(game.turnUUID);

            if(game.verifySocketUUID(socket.id, uuid) && socket.id === turnPlayer.socketId && game.rollsRemainingInTurn < 3) { // Toggle kept dice if it's the emitter's turn.
                if(diceId in game.keptDiceVals) {
                    const diceVal = game.keptDiceVals[diceId];
                    game.diceToRoll[diceId] = diceVal;
                    delete game.keptDiceVals[diceId];
                    io.sockets.to(gameId).emit('keptDiceClicked', { diceId, diceVal });
                }
                else {
                    const diceVal = game.diceToRoll[diceId];
                    game.keptDiceVals[diceId] = diceVal;
                    delete game.diceToRoll[diceId];
                    io.sockets.to(gameId).emit('rolledDiceClicked', { diceId, diceVal });
                }
            }
        }
    });

    socket.on('setKeptDice', (data) => {
        const gameId = data.gameId;
        const uuid = data.uuid;
        const keptDice = data.keptDice;

        if(isGameIdValid(gameId)) {
            const game = ALL_GAMES[gameId];
            const turnPlayer = game.players.get(game.turnUUID);

            if(game.verifySocketUUID(socket.id, uuid) && socket.id === turnPlayer.socketId && game.rollsRemainingInTurn < 3) { // Toggle kept dice if it's the emitter's turn.
                game.setKeptDice(keptDice);
                io.sockets.to(gameId).emit('setKeptDice', { keptDice: game.keptDiceVals });
            }
        }
    });

    socket.on('selectScore', function(data) {
        const gameId = data.gameId;
        const uuid = data.uuid;
        const selectedCategory = data.scoreCategory;

        if(isGameIdValid(gameId)) {
            const game = ALL_GAMES[gameId];
            const turnPlayer = game.players.get(game.turnUUID);

            if(game.verifySocketUUID(socket.id, uuid) && socket.id === turnPlayer.socketId && game.rollsRemainingInTurn < 3) { // Set selected score and end turn if it's the emitter's turn and they have rolled at least once. // removed this condition? data.playerDisplayName && data.playerDisplayName.replace(/\s+/g, '') === playerDisplayName.replace(/\s+/g, '')
                const selectedCategoryScore = game.possibleScores[selectedCategory].value;

                if(selectedCategoryScore >= 0) {
                    const isSinglePlayer = game.isSinglePlayer;
                    const logMessageInfo = { playerName: turnPlayer.displayName, scoreCategory: selectedCategory, scoreValue: selectedCategoryScore };
                    game.addLogMessage(logMessageInfo);
                    io.sockets.to(gameId).emit('logMessageAdded', logMessageInfo);

                    game.checkYahtzeeBonus();
                    turnPlayer.scorecard.updateScore(selectedCategory, selectedCategoryScore);

                    io.sockets.to(gameId).emit('scoreSelected', { playerDisplayName: turnPlayer.displayName, selectedCategory, selectedCategoryScore });
                    io.sockets.to(gameId).emit('getScorecard', { playerDisplayName: turnPlayer.displayName, scorecard: turnPlayer.scorecard.scoreVals, totalScore: turnPlayer.scorecard.totalScore });
                    game.endTurn();

                    if(game.inProgress) {
                        const nextTurnPlayer = game.players.get(game.turnUUID);
                        io.sockets.to(gameId).emit('startTurn', { turnSocketId: nextTurnPlayer.socketId, turnDisplayName: nextTurnPlayer.displayName, rollsRemaining: game.rollsRemainingInTurn, isSinglePlayer });
                    }
                    else {
                        const logMessageInfo = { message: 'Game over' };
                        game.addLogMessage(logMessageInfo);
                        io.sockets.to(gameId).emit('logMessageAdded', logMessageInfo);
                        io.sockets.to(gameId).emit('gameEnded', { isSinglePlayer, winnerDisplayName: game.winner.displayName });
                    }
                }
            }
        }
    });

    socket.on('disconnecting', function() { // handled just before socket is closed - socket is removed from rooms once fully disconnected
        const rooms = Array.from(socket.rooms);
    
        rooms.forEach(gameId => {
            if(isGameIdValid(gameId)) {
                const game = ALL_GAMES[gameId];

                // remove player from game.connectedPlayerUUIDs

                // if(game.isSinglePlayer) {
                //     delete ALL_GAMES[gameId];
                // }

                // TODO: close multiplayer room if all players disconnected - also add some way for the leader to kick players
                if(socket.id === game.getLeaderSocketId() && (game.isWaiting || !game.inProgress)) { // close room if leader disconnects before game is started or after game ends
                    removeOpenGameId(gameId);
                    delete ALL_GAMES[gameId];
                    io.sockets.to(gameId).emit('roomClosed');
                    socket.broadcast.emit('updateOpenRooms', { rooms: getOpenRoomInfo() });
                }
                else if(game.isWaiting) { // remove player (non-leader) from game if they disconnect while waiting to start
                    game.removePlayerBySocketId(socket.id);
                    io.sockets.to(gameId).emit('updateWaitingPlayers', { displayNames: game.getPlayerDisplayNames(), maxPlayers: game.maxPlayers });
                    socket.broadcast.emit('updateOpenRooms', { rooms: getOpenRoomInfo() });
                }
                else if(game.inProgress) {
                    console.log('Player disconnected while game is in progress');
                }
            }
        });

        console.log(user ? `${user.username} disconnected` : 'Unauthenticated user disconnected');
    });
});

const handleShutdown = async () => {
    try {
        await db.closePool();
        console.log('Shutting down.');
        process.exit(0);
    } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
    }
};

process.on('SIGINT', handleShutdown);  // ctrl+c
process.on('SIGTERM', handleShutdown); // termination signal