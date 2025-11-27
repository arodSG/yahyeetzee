import Player from './Player.js';
import db from '../utils/DBUtil.js';
import redis from '../utils/RedisUtil.js';
import { rando } from '@nastyox/rando.js';
import { diceNumToText } from '../utils/Util.js';

export default class Game { // contruct game objects when multiplayer room is created, don't wait until it starts.
    constructor(io, gameId, maxPlayers, leaderUUID) {
        this.io = io;
        this.gameId = gameId;
        this.isWaiting = true;
        this.isSinglePlayer = maxPlayers === 1;
        this.maxPlayers = parseInt(maxPlayers, 10);
        this.leaderUUID = leaderUUID;
        this.inProgress = false;
        this.diceToRoll = { dice1: 1, dice2: 1, dice3: 1, dice4: 1, dice5: 1 };
        this.keptDiceVals = {};
        this.rollsRemainingInTurn = 3;
        this.possibleScores = {};
        this.isYahtzee = false;
        this.connectedPlayerUUIDs = new Set();
        this.players = new Map(); // { "uuid": Player, "uuid": Player }
        this.turnUUID = null;
        this.logMessages = [];
        this.isGameOver = false;
        this.winner = null;
    }

    getLeaderDisplayName() {
        return this.players.has(this.leaderUUID) && this.players.get(this.leaderUUID) != null ? this.players.get(this.leaderUUID).displayName : '';
    }

    isDuplicateUserId(userId) {
        return Array.from(this.players.values()).some(player => userId && userId === player.userId);
    }

    addStartingPlayer(uuid, socketId, userId, displayName) {
        if(!this.isDuplicateUserId(userId)) {
            this.players.set(uuid, new Player(uuid, socketId, userId, displayName));
        }
    }

    getPlayerDisplayNames() {
        const displayNames = [];
        for(const player of this.players.values()) {
            displayNames.push(player.displayName);
        }
        return displayNames;
    }

    isMaxPlayersAdded() {
        return this.players.size === this.maxPlayers;
    }

    updatePlayerIds(uuid, socketId, userId) {
        const player = this.players.get(uuid);

        if(player) {
            player.socketId = socketId;
            player.userId = userId;
        }
    }

    getLeaderSocketId() {
        return this.players.get(this.leaderUUID).socketId;
    }

    getPlayerUUIDBySocketId(socketId) {
        let playerUUID = null;
        this.players.forEach((player, uuid) => {
            if(player.socketId === socketId) {
                playerUUID = uuid;
            }
        });
        return playerUUID;
    }

    verifySocketUUID(socketId, uuid) {
        const playerUUID = this.getPlayerUUIDBySocketId(socketId);
        return uuid === playerUUID;
    }

    removePlayerBySocketId(socketId) {
        const playerUUID = this.getPlayerUUIDBySocketId(socketId);

        if(playerUUID) {
            this.players.delete(playerUUID);
        }
    }

    startGame() {
        if(!this.inProgress) {
            this.isWaiting = false;
            this.inProgress = true;
            this.turnUUID = this.players.keys().next().value;
            this.isSinglePlayer = this.players.size === 1;
            this.logMessages = [];
            this.isGameOver = false;
            this.winner = null;
            console.log('Game started');
        }
    }

    getPlayerIndex(uuid) {
        let index = 0;
        for(let k of this.players.keys()) {
            if(k === uuid) {
                return index;
            }
            index++;
        }
        return -1;
    }
    
    rollDice() {
        if(this.inProgress && this.rollsRemainingInTurn > 0) {
            Object.keys(this.diceToRoll).forEach(key => {
                this.diceToRoll[key] = rando(1, 6);
            });

            const turnPlayer = this.players.get(this.turnUUID);
            const allDice = { ...this.diceToRoll, ...this.keptDiceVals };
            const allDiceValues = Array.from(Object.values(allDice));
            const firstValue = allDiceValues[0];
            this.isYahtzee = allDiceValues.every(value => value === firstValue);
            
            this.possibleScores = this.calculatePossibleScores(allDice, turnPlayer);
            this.rollsRemainingInTurn--;
        }
    }

    calculatePossibleScores(allDice, turnPlayer) {
        const groupedDiceValues = Object.entries(allDice).reduce((acc, [key, value]) => { // { '1': [ 'dice3', 'dice4' ], '4': [ 'dice1' ], '5': [ 'dice2', 'dice5' ] }
            acc[value] = acc[value] || [];
            acc[value].push(key);
            return acc;
        }, {});
        const groupedDiceNames = Object.values(groupedDiceValues); // [ [ 'dice3', 'dice4' ], [ 'dice1' ], [ 'dice2', 'dice5' ] ]
        const totalDiceValue = Object.values(allDice).reduce((accumulator, currentValue) => accumulator + currentValue, 0);

        const threeOfAKindDice = groupedDiceNames.filter(group => group.length >= 3).flat();
        const fourOfAKindDice = groupedDiceNames.filter(group => group.length >= 4).flat();
        const smallStraightDice = this.checkStraight(groupedDiceValues, 4) || [];
        const largeStraightDice = this.checkStraight(groupedDiceValues, 5) || [];

        const hasThreeOfAKind = threeOfAKindDice.length !== 0;
        const hasFourOfAKind = fourOfAKindDice.length !== 0;
        const hasFullHouse = groupedDiceNames.length == 2 &&
            (groupedDiceNames[0].length === 2 && groupedDiceNames[1].length === 3 ||
            groupedDiceNames[0].length === 3 && groupedDiceNames[1].length === 2)
        const hasSmallStraight = smallStraightDice.length !== 0;
        const hasLargeStraight = largeStraightDice.length !== 0;
        this.isYahtzee = groupedDiceNames.length == 1 && groupedDiceNames[0].length === 5;

        const yahtzeeDiceValue = Object.keys(groupedDiceValues)[0];
        const subsequentYahtzee = this.isYahtzee && turnPlayer.scorecard.scoreVals.yahtzee >= 0;
        const yahtzeeUpperCategory = diceNumToText(yahtzeeDiceValue);
        const yahtzeeUpperCategoryAllowed = turnPlayer.scorecard.scoreVals.yahtzee >= 0 && turnPlayer.scorecard.scoreVals[yahtzeeUpperCategory] < 0;
        const lowerCategoryOpen = ['threeOfAKind', 'fourOfAKind', 'fullHouse', 'smallStraight', 'largeStraight', 'chance'].some(category => turnPlayer.scorecard.scoreVals[category] < 0);
        const yahtzeeLowerCategoryAllowed = this.isYahtzee && !yahtzeeUpperCategoryAllowed && subsequentYahtzee && lowerCategoryOpen;
        const allowZeros = !this.isYahtzee || (subsequentYahtzee && !yahtzeeUpperCategoryAllowed && !yahtzeeLowerCategoryAllowed);

        const onesValue = groupedDiceValues['1'] && (!this.isYahtzee || yahtzeeUpperCategoryAllowed) ? groupedDiceValues['1'].length : 0;
        const twosValue = groupedDiceValues['2'] && (!this.isYahtzee || yahtzeeUpperCategoryAllowed) ? groupedDiceValues['2'].length * 2 : 0;
        const threesValue = groupedDiceValues['3'] && (!this.isYahtzee || yahtzeeUpperCategoryAllowed) ? groupedDiceValues['3'].length * 3 : 0;
        const foursValue = groupedDiceValues['4'] && (!this.isYahtzee || yahtzeeUpperCategoryAllowed) ? groupedDiceValues['4'].length * 4 : 0;
        const fivesValue = groupedDiceValues['5'] && (!this.isYahtzee || yahtzeeUpperCategoryAllowed) ? groupedDiceValues['5'].length * 5 : 0;
        const sixesValue = groupedDiceValues['6'] && (!this.isYahtzee || yahtzeeUpperCategoryAllowed) ? groupedDiceValues['6'].length * 6 : 0;
        const threeOfAKindValue = (hasThreeOfAKind && !this.isYahtzee) || yahtzeeLowerCategoryAllowed ? totalDiceValue : 0;
        const fourOfAKindValue = (hasFourOfAKind && !this.isYahtzee) || yahtzeeLowerCategoryAllowed ? totalDiceValue : 0;
        const fullHouseValue = hasFullHouse || yahtzeeLowerCategoryAllowed ? 25 : 0;
        const smallStraightValue = hasSmallStraight || yahtzeeLowerCategoryAllowed ? 30 : 0;
        const largeStraightValue = hasLargeStraight || yahtzeeLowerCategoryAllowed ? 40 : 0;
        const chanceValue = !this.isYahtzee || yahtzeeLowerCategoryAllowed ? totalDiceValue : 0;
        const yahtzeeValue = this.isYahtzee ? 50 : 0;

        const possibleScores = {};
        possibleScores.ones = { value: onesValue, dice: groupedDiceValues['1'] || [] };
        possibleScores.twos = { value: twosValue, dice: groupedDiceValues['2'] || [] };
        possibleScores.threes = { value: threesValue, dice: groupedDiceValues['3'] || [] };
        possibleScores.fours = { value: foursValue, dice: groupedDiceValues['4'] || [] };
        possibleScores.fives = { value: fivesValue, dice: groupedDiceValues['5'] || [] };
        possibleScores.sixes = { value: sixesValue, dice: groupedDiceValues['6'] || [] };
        possibleScores.threeOfAKind = { value: threeOfAKindValue, dice: threeOfAKindDice };
        possibleScores.fourOfAKind = { value: fourOfAKindValue, dice: fourOfAKindDice };
        possibleScores.fullHouse = { value: fullHouseValue, dice: hasFullHouse ? Object.keys(allDice) : [] };
        possibleScores.smallStraight = { value: smallStraightValue, dice: hasSmallStraight ? smallStraightDice : [] };
        possibleScores.largeStraight = { value: largeStraightValue, dice: hasLargeStraight ? largeStraightDice : [] };
        possibleScores.chance = { value: chanceValue, dice: Object.keys(allDice) };
        possibleScores.yahtzee = { value: yahtzeeValue, dice: this.isYahtzee ? Object.keys(allDice) : [] };

        Object.keys(possibleScores).forEach(category => {
            if(turnPlayer.scorecard.scoreVals[category] >= 0 || (!allowZeros && possibleScores[category].value === 0)) { // Remove category from possibleScores if it has already been updated on the scorecard, or if zeros aren't allowed
                delete possibleScores[category];
            }
        });

        return possibleScores;
    }

    checkStraight(diceGroups, straightLength) {
        const sortedValues = Object.keys(diceGroups).map(Number).sort((a, b) => a - b);
    
        const getDiceNamesForStraight = (length) => {
            for(let i = 0; i <= sortedValues.length - length; i++) {
                if(sortedValues.slice(i, i + length).every((val, idx, arr) => idx === 0 || val === arr[idx - 1] + 1)) {
                    return sortedValues.slice(i, i + length).map((val) => diceGroups[val][0]);
                }
            }
            return null;
        };
    
        return getDiceNamesForStraight(straightLength);
    }

    setKeptDice(keptDice) {
        if(this.rollsRemainingInTurn < 3) { // only allow dice to be kept after the player has rolled at least once
            const allDice = { ...this.diceToRoll, ...this.keptDiceVals };
            this.diceToRoll = {};
            this.keptDiceVals = {};

            Object.keys(allDice).forEach(diceId => {
                const diceVal = allDice[diceId];

                if(keptDice.includes(diceId)) {
                    this.keptDiceVals[diceId] = diceVal;
                }
                else {
                    this.diceToRoll[diceId] = diceVal;
                }
            });
        }
    }
    
    endTurn() {
        if(this.inProgress) {
            let allPlayersDone = true;
            this.players.values().forEach(player => {
                if(!player.scorecard.allCategoriesDone) { // If any player's total score is not set, meaning they aren't done with the game
                    allPlayersDone = false;
                }
            });

            if(allPlayersDone) {
                this.endGame();
            }
            else {
                const playerTurnIndex = this.getPlayerIndex(this.turnUUID);
                const nextTurnIndex = playerTurnIndex >= (this.players.size - 1) ? 0 : playerTurnIndex + 1;

                this.turnUUID = Array.from(this.players.keys())[nextTurnIndex];
                this.rollsRemainingInTurn = 3;

                Object.keys(this.keptDiceVals).forEach(key => {
                    this.diceToRoll[key] = this.keptDiceVals[key];
                    delete this.keptDiceVals[key];
                });
            }
        }
    }

    checkYahtzeeBonus() {
        const turnPlayer = this.players.get(this.turnUUID);

        if(this.isYahtzee) {
            turnPlayer.scorecard.numYahtzees++;

            if(turnPlayer.scorecard.scoreVals.yahtzee >= 50) { // If the player rolled a yahtzee and already has a yahtzee on their scorecard, add 100 point yahtzee bonus. 
                turnPlayer.scorecard.addYahtzeeBonus(); // Must be done before calling updateScore to ensure total score is accurate
            }
        }
    }

    addLogMessage(logMessageInfo) { // { message } for simple messages, { playerName, scoreCategory, scoreValue } for score selected messages
        this.logMessages.push(logMessageInfo);
    }

    endGame() {
        this.isGameOver = true;
        this.inProgress = false;
        this.turnUUID = null;
        this.setWinner();
        this.savePlayerScores();
    }

    setWinner() {
        let winningUserScore = 0;

        this.players.forEach(player => {
            const playerScore = player.scorecard.totalScore;
            const isNewWinner = playerScore > winningUserScore;

            if(playerScore > winningUserScore) {
                this.winner = player;
                winningUserScore = isNewWinner ? playerScore : winningUserScore;
            }
        });
    }

    savePlayerScores() {
        this.players.forEach(async (player) => {
            const userId = player.userId;

            if(userId) {
                const isBonus = player.scorecard.scoreVals.bonus > 0;
                const numYahtzees = player.scorecard.numYahtzees;
                const totalScore = player.scorecard.totalScore;

                try {
                    if(this.isSinglePlayer) {
                        await db.insertSingleGame(userId, isBonus, numYahtzees, totalScore);
                    }
                    else {
                        const winningUserId = this.winner.userId;
                        const isWinner = userId === winningUserId;
                        await db.insertMultiGame(userId, isBonus, numYahtzees, totalScore, isWinner);
                    }

                    // Invalidate and refresh the cache for this user's stats
                    await redis.invalidateUserStatsCache(userId);
                    
                    // Fetch fresh stats from database and cache them
                    const singleStatsQuery = db.getSingleStats(userId);
                    const multiStatsQuery = db.getMultiStats(userId);
                    const singleTopScoresQuery = db.getSingleTopScores(userId);
                    const multiTopScoresQuery = db.getMultiTopScores(userId);

                    const results = await Promise.all([singleStatsQuery, multiStatsQuery, singleTopScoresQuery, multiTopScoresQuery]);
                    const singleStats = results[0][0] || { bonuses: 0, yahtzees: 0, games: 0, average_score: 0 };
                    const multiStats = results[1][0] || { bonuses: 0, yahtzees: 0, games: 0, average_score: 0, wins: 0 };
                    const singleTopScores = results[2] || [];
                    const multiTopScores = results[3] || [];

                    await redis.cacheUserStats(userId, singleStats, multiStats, singleTopScores, multiTopScores);
                }
                catch(error) {
                    console.log(error);
                    // emit to player.socketId saying the score was not saved
                }
            }
        });
    }
}