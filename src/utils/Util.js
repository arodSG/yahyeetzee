import { rando } from '@nastyox/rando.js';
import jwt from 'jsonwebtoken';

export const ALL_GAMES = {}; // { gameId: Game }
export const OPEN_GAME_IDS = [];

export function isGameIdValid(gameId) {
    return gameId in ALL_GAMES;
}

export function isValidDisplayName(playerDisplayName) {
    const regex = /^[a-z0-9 ]+$/i;
    return playerDisplayName && playerDisplayName.trim() !== '' && regex.test(playerDisplayName);
}

export function diceNumToText(diceNum) {
    switch(diceNum) {
        case '1':
            return 'ones';
        case '2':
            return 'twos';
        case '3':
            return 'threes';
        case '4':
            return 'fours';
        case '5':
            return 'fives';
        case '6':
            return 'sixes';
        default:
            return '';
    }
}

export function generateGameId() {
    let gameId;
    do {
        gameId = rando(1000, 9999);
    } while(gameId in ALL_GAMES);
    return gameId;
}

export function getOpenRoomInfo() {
    const openRoomInfo = [];
    OPEN_GAME_IDS.forEach(gameId => {
        const game = ALL_GAMES[gameId];
        openRoomInfo.push({ gameId, leaderDisplayName: game.getLeaderDisplayName(), numConnected: game.players.size, numMax: game.maxPlayers });
    });
    return openRoomInfo;
}

export function removeOpenGameId(gameId) {
    const openGameIdIndex = OPEN_GAME_IDS.indexOf(parseInt(gameId, 10));
    if(openGameIdIndex !== -1) {
        OPEN_GAME_IDS.splice(openGameIdIndex, 1);
    }
}

export function isDisplayNameValid(displayName) {
    return /^[a-zA-Z0-9 ]{1,12}$/.test(displayName);
}

export function isRoomNameAvailable(leaderDisplayName) {
    const rooms = getOpenRoomInfo();
    return !rooms.some(room => room.leaderDisplayName === leaderDisplayName);
}

export function generateJWT(username) {
    return jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '10m' });
}

export function getEmailWaitTimeRemaining(lastVerificationSendDate) {
    const now = new Date();
    const timeDifference = now - lastVerificationSendDate;
    const MIN_TIME_BETWEEN_EMAILS = 10 * 60 * 1000; // 10 minutes
    return Math.floor((MIN_TIME_BETWEEN_EMAILS - timeDifference) / 60000);
}