import { socket, settings, isLight, setDiceSymbolColors, setTooltipTheme } from './global.js';

const SCORE_CATEGORIES = {
    ones: 'Ones',
    twos: 'Twos',
    threes: 'Threes',
    fours: 'Fours',
    fives: 'Fives',
    sixes: 'Sixes',
    threeOfAKind: 'Three of a Kind',
    fourOfAKind: 'Four of a Kind',
    fullHouse: 'Full House',
    smallStraight: 'Small Straight',
    largeStraight: 'Large Straight',
    chance: 'Chance',
    yahtzee: 'Yahtzee'
};
let displayName = '';
let showAltMessageBackground = false;
let myTurn = false;
const diceToRoll = { dice1: 1, dice2: 1, dice3: 1, dice4: 1, dice5: 1 };
let keptDice = {};
let $turnPossibleScores = [];
let turnPossibleCategories = {};

let scoreClickedOnce = false;
let $previousClickedScoreContainer = null;
let previousClickedScoreCategory = '';
let previousClickedScoreValue = '';

let tries = 0;
let maxRetries = 3;

let gameOverModal, confirmZeroModal;

socket.on('connect_error', (err) => {
    console.log(`Error connecting to server: ${err.message}`);
    tries++;
    
    if(tries < maxRetries) {
        socket.connect();
    }
    else {
        console.log('Max retries exceeded');
        // hide page loading spinner
        alert('Error connecting to server.');
    }
});

$(document).ready(function() { // TODO: Add some kind of loading spinner on page load. This will give time to send socket request to verify multi player gameId.
    gameOverModal = new bootstrap.Modal(document.getElementById('game-over-modal'), {});
    confirmZeroModal = new bootstrap.Modal(document.getElementById('confirm-zero-modal'), {});
    displayName = settings.displayName || 'Guest';

    handleBackgroundColorChange();
    handleDiceColorChange();
    socket.emit('setDisplayName', { playerDisplayName: displayName });

    let path = window.location.pathname;
    if(path.startsWith('/')) {
        path = path.substring(1);
    }
    const pathSplit = path.split('/');

    if(pathSplit.length === 2) {
        const gameId = pathSplit[1];
        settings.gameId = gameId;
        socket.emit('checkGameId', { gameId });
    }

    $('#background-color').on('input', () => {
        handleBackgroundColorChange();
    });

    $('#dice-color').on('input', () => {
        handleDiceColorChange();
    });

    $('#roll-dice-button').click(function() {
        resetConfirmingScore();
        socket.emit('rollDice', { gameId: settings.gameId, uuid: settings.uuid });
    });

    $('.dice').click(function() {
        if(myTurn) {
            const diceId = $(this).attr('id');
            socket.emit('diceClicked', { gameId: settings.gameId, uuid: settings.uuid, diceId });
        }
    });

    $('#right-container .score-table').on('click', '.score-category', function() {
        if(myTurn) {
            const $parentRow = $(this).parent('tr');
            const scoreCategory = $parentRow.attr('class');

            if(Object.keys(turnPossibleCategories).includes(scoreCategory)) {
                socket.emit('setKeptDice', { gameId: settings.gameId, uuid: settings.uuid, keptDice: turnPossibleCategories[scoreCategory].dice });
            }
        }
    });

    $('#game-over-quit-button').on('click', function() {
        window.location.href = '/';
    });
});

socket.on('initGame', function(data) {
    const gameId = data.gameId;
    const isSinglePlayer = data.isSinglePlayer;
    const isWaiting = data.isWaiting;
    const inProgress = data.inProgress;
    const isGameOver = data.isGameOver;

    if(inProgress || isGameOver) {
        socket.emit('getGameInfo', { gameId });
    }
    else if(isSinglePlayer) {
        socket.emit('startGame', { gameId, uuid: settings.uuid });
    }
    else if(isWaiting) {
        $('#spinner-container-wrapper').fadeOut(100, () => {
            $('#waiting-container-wrapper').fadeIn(100);
        });

        $('#start-game-button').click(function() {
            socket.emit('startGame', { gameId, uuid: settings.uuid });
        });
        socket.emit('joinRoom', { gameId, uuid: settings.uuid, displayName });
    }
});

function buildLogMessage(logMessageInfo) {
    const message = logMessageInfo.message;
    const playerName = logMessageInfo.playerName;
    const scoreCategory = logMessageInfo.scoreCategory;
    const scoreValue = logMessageInfo.scoreValue;
    
    if(message) {
        addLogMessage(message);
    }
    else if(playerName && scoreCategory) {
        const logMessage = scoreCategory === 'yahtzee' && scoreValue == null ?
            `<span class="fw-bold">${playerName}</span> rolled a <span class="fw-bold">Yahtzee</span>!` :
            `<span class="fw-bold">${playerName}</span> scored <span class="fw-bold">${scoreValue}</span> on ${SCORE_CATEGORIES[scoreCategory]}`
        addLogMessage(logMessage);
    }
}

socket.on('logMessageAdded', data => {
    buildLogMessage(data);
});

socket.on('refreshGameInfo', function(data) { // TODO: update UI based on player turn
    const allPlayerDisplayNames = data.allPlayerDisplayNames;
    const allPlayerScoreInfo = data.allPlayerScoreInfo;
    const turnDisplayName = data.turnDisplayName;
    const rolledDice = data.rolledDice;
    const keptDice = data.keptDice;
    const rollsRemaining = data.rollsRemaining;
    const possibleScores = data.possibleScores;
    const isSinglePlayer = data.isSinglePlayer;
    const logMessages = data.logMessages;
    const inProgress = data.inProgress;
    const winnerDisplayName = data.winnerDisplayName;
    myTurn = data.turnSocketId === socket.id;

    updateScoreTable(allPlayerDisplayNames);

    allPlayerScoreInfo.forEach((playerScoreInfo, index) => {
        updateScorecard(allPlayerDisplayNames[index], playerScoreInfo.scoreVals, playerScoreInfo.totalScore);
    });

    logMessages.forEach(logMessage => {
        buildLogMessage(logMessage);
    });

    setRolledDice(rolledDice);
    setKeptDice(keptDice);

    if(inProgress) {
        startTurn(myTurn, turnDisplayName, rollsRemaining, !isSinglePlayer);

        if(myTurn && rollsRemaining < 3) {
            updatePossibleScores(turnDisplayName, possibleScores);
            const playerClassName = turnDisplayName.replace(/\s+/g, '');
            $('#right-container .score-table').on('click', `.player-score.${playerClassName}`, handlePlayerScoreClicked);
        }
    }

    $('#spinner-container-wrapper').fadeOut(100, () => {
        $('#game-container').fadeIn(100, () => {
            if(winnerDisplayName) {
                $('#game-over-winner')[isSinglePlayer ? 'hide' : 'show']();
                $('#game-over-winner-name').text(winnerDisplayName);

                setTimeout(function() {
                    gameOverModal.show();
                }, 1000);
            }
        });
    });
});

socket.on('gameStarted', function(data) {
    updateScoreTable(data.displayNames);
    resetRolledDice();
    $('#game-over-modal').hide();

    const isWaitingContainerVisible = $('#waiting-container-wrapper').is(":visible");

    $(isWaitingContainerVisible ? '#waiting-container-wrapper' : '#spinner-container-wrapper').fadeOut(100, () => {
        $('#game-container').fadeIn(100);
    });
});

socket.on('updateWaitingPlayers', function(data) {
    const playerDisplayNames = data.displayNames;
    const maxPlayers = data.maxPlayers;
    const backgroundColor = settings.isBackgroundLight ? 'bg-dark' : 'bg-light';
    const textColor = settings.isBackgroundLight ? 'text-light' : 'text-dark';
    let waitingPlayersHtml = '';

    for(let i=0; i<maxPlayers; i++) {
        const displayName = playerDisplayNames[i] || '';
        waitingPlayersHtml += `<div class="waiting-player-container ${backgroundColor} ${textColor} d-flex rounded-pill shadow mt-3"><span class="w-100 px-3">${displayName}</span></div>`;
    }

    $('#waiting-players-container').html(waitingPlayersHtml);
    $('#num-players').html(`${playerDisplayNames.length}/${maxPlayers}`);
});

socket.on('updateLeaderUI', () => {
    $('#start-game-button').show();
});

socket.on('roomClosed', () => { // show "Room Closed" modal with a "Leave Room" button, no close button
    window.alert('room closed');
});

socket.on('startTurn', function(data) {
    myTurn = data.turnSocketId === socket.id;
    const turnDisplayName = data.turnDisplayName;
    const rollsRemaining = data.rollsRemaining;
    const isMultiPlayer = !data.isSinglePlayer;
    startTurn(myTurn, turnDisplayName, rollsRemaining, isMultiPlayer);
    resetRolledDice();  
});

function startTurn(myTurn, turnDisplayName, rollsRemaining, isMultiPlayer) {
    const playerClassName = turnDisplayName.replace(/\s+/g, '');

    $('#player-turn').text(turnDisplayName.toLowerCase().endsWith('s') ? `${turnDisplayName}' turn` : `${turnDisplayName}'s turn`);
    $('#rolls-remaining').text(rollsRemaining);
    $('#right-container .score-table').off('click', `.player-score.${playerClassName}`, handlePlayerScoreClicked);

    if(isMultiPlayer) {
        $('.player-heading').removeClass('player-turn-background');
        $('.player-score').removeClass('player-turn-background');
        $(`.player-score.${playerClassName}`).addClass('player-turn-background');
        $(`.player-heading.${playerClassName}`).addClass('player-turn-background');

        if(myTurn && settings.volumeLevel > 0) {
            const playerTurnSound = document.getElementById('player-turn-sound');
            playerTurnSound.volume = settings.volumeLevel / 100;
            playerTurnSound.play();
        }
    }

    $('#roll-dice-button').css('visibility', myTurn && rollsRemaining > 0 ? 'visible' : 'hidden');
    $('#roll-dice-button').prop('disabled', !myTurn);
    $('.player-score').removeClass('text-danger');
}

let turnInProgress = false;

socket.on('diceRolled', function(data) { // turnSocketId: turnPlayer.socketId, turnDisplayName: turnPlayer.displayName, diceToRoll, rollsRemaining: game.rollsRemainingInTurn
    myTurn = socket.id === data.turnSocketId;
    turnInProgress = true;
    startDiceRoll(data, myTurn);
});

function startDiceRoll(data, myTurn) {
    $('#roll-dice-button').prop('disabled', true);

    $turnPossibleScores.forEach($turnPossibleScore => {
        $turnPossibleScore.text('');
    });
    turnPossibleCategories = {};

    startDiceRollAnimation(data, myTurn, 0);
}

function startDiceRollAnimation(data, myTurn, numDiceRollAnimations) {
    if(numDiceRollAnimations < 8) {
        Object.keys(data.diceToRoll).forEach(key => {
            const diceRollAnimationVal = Math.floor(Math.random() * 6) + 1;
            $(`#${key} use`).attr('href', `#dice-${diceRollAnimationVal}`);
        });

        numDiceRollAnimations++;
        setTimeout(() => startDiceRollAnimation(data, myTurn, numDiceRollAnimations), 100);
    }
    else {
        finishDiceRoll(data, myTurn);
    }
}

function finishDiceRoll(data, myTurn) {
    const turnDisplayName = data.turnDisplayName;
    const diceToRoll = data.diceToRoll;
    const rollsRemainingInTurn = data.rollsRemaining;
    const possibleScores = data.possibleScores;
    const isYahtzee = data.isYahtzee;
    const playerClassName = turnDisplayName.replace(/\s+/g, '');

    setRolledDice(diceToRoll);

    if(turnInProgress) { // prevents unexpected timer behavior (from startDiceRollAnimation setTimout) when tab is not in focus
        $('#roll-dice-button').prop('disabled', rollsRemainingInTurn === 0);
        $('#rolls-remaining').text(rollsRemainingInTurn);

        if(rollsRemainingInTurn === 0) {
            $('#roll-dice-button').css('visibility', 'hidden');
        }
    }

    if(myTurn) {
        updatePossibleScores(turnDisplayName, possibleScores);

        if(rollsRemainingInTurn == 2) {
            $('#right-container .score-table').on('click', `.player-score.${playerClassName}`, handlePlayerScoreClicked);
        }
    }

    if(isYahtzee) {
        rolledYahtzee(turnDisplayName);
    }
}

function updatePossibleScores(playerDisplayName, possibleScores) {
    Object.keys(possibleScores).forEach(key => {
        const scoreVal = possibleScores[key].value;
        const $scoreSelector = $(`#right-container .${key} > .${playerDisplayName.replace(/\s+/g, '')}`);

        $scoreSelector.removeClass('text-danger');
        turnPossibleCategories[key] = possibleScores[key];

        if(scoreVal > 0) {
            $scoreSelector.text(scoreVal).addClass('text-danger');
            $turnPossibleScores.push($scoreSelector);
        }
        else {
            $scoreSelector.text('');
        }
    });
}

function rolledYahtzee(playerDisplayName) {
    if(settings.volumeLevel > 0) {
        const coleYeetSound = document.getElementById('cole-yeet-sound');
        coleYeetSound.volume = settings.volumeLevel / 100;
        coleYeetSound.play();
    }
    const selectedScoreMessage = `<span class="fw-bold">${playerDisplayName}</span> rolled a <span class="fw-bold">Yahtzee</span>!`;
    addLogMessage(selectedScoreMessage);
}

socket.on('rolledDiceClicked', function(data) {
    const params = {};
    params[data.diceId] = data.diceVal;
    setKeptDice(params);
});

socket.on('keptDiceClicked', function(data) {
    const diceId = data.diceId;
    diceToRoll[diceId] = data.diceVal;
    delete keptDice[diceId];
    
    if(Object.keys(diceToRoll).length !== 0) {
        $('#roll-dice-button').prop('disabled', false);
    }
    
    $('#rolled-dice-container').append($('#' + diceId));
});

socket.on('setKeptDice', data => {
    const newRolledDice = {};

    Object.keys(keptDice).forEach(keptDiceId => {
        if(!(keptDiceId in data.keptDice)) {
            newRolledDice[keptDiceId] = keptDice[keptDiceId];
        }
    });

    addRolledDice(newRolledDice);
    setKeptDice(data.keptDice);
});

socket.on('scoreSelected', function(data) {
    turnInProgress = false;
    const playerDisplayName = data.playerDisplayName;
    const scoreCategory = data.selectedCategory;
    const scoreValue = data.selectedCategoryScore;
    const $scoreSelector = $(`#right-container .${scoreCategory} > .${playerDisplayName.replace(/\s+/g, '')}`);
    const bsLightColor = getComputedStyle(document.documentElement).getPropertyValue('--bs-light').trim();
    const bsDarkColor = getComputedStyle(document.documentElement).getPropertyValue('--bs-dark').trim();

    $scoreSelector.removeClass('cell-hover').stop().animate({ backgroundColor: '#3ec246', color: bsDarkColor }, 200).delay(2000).animate({ backgroundColor: bsDarkColor, color: bsLightColor }, 200, () => {
        $scoreSelector.addClass('cell-hover');
    });
    $turnPossibleScores = [];
    turnPossibleCategories = {};
});

socket.on('getScorecard', function(data) {
    const playerDisplayName = data.playerDisplayName;
    const scorecard = data.scorecard;
    const totalScore = data.totalScore;

    updateScorecard(playerDisplayName, scorecard, totalScore);
});

function updateScorecard(playerDisplayName, scorecard, totalScore) {
    Object.keys(scorecard).forEach(key => {
        const scoreVal = scorecard[key];
        const $scoreSelector = $('.' + key + ' > .' + playerDisplayName.replace(/\s+/g, ''));
        $scoreSelector.removeClass('text-danger').addClass(scoreVal >= 0 ? 'selected-score' : '');
        $scoreSelector.text(scoreVal >= 0 ? scoreVal : '');
    });

    $('.totalScore' + ' > .' + playerDisplayName.replace(/\s+/g, '')).text(totalScore >= 0 ? totalScore : '');
}

socket.on('gameEnded', function(data) {
    const winnerDisplayName = data.winnerDisplayName;
    const isSinglePlayer = data.isSinglePlayer;

    $('#roll-dice-button').css('visibility', 'hidden');
    $('.player-heading').removeClass('player-turn-background');
    $('.player-score').removeClass('player-turn-background');
    $('#game-over-winner')[isSinglePlayer ? 'hide' : 'show']();
    $('#game-over-winner-name').text(winnerDisplayName);

    setTimeout(function() {
        gameOverModal.show();
    }, 1000);
});

function handlePlayerScoreClicked() {
    const classList = $(this).attr('class');

    if(myTurn && !classList.includes('selected-score')) {
        const $parentRow = $(this).parent('tr');
        const scoreCategory = $parentRow.attr('class');
        
        if(Object.keys(SCORE_CATEGORIES).includes(scoreCategory) && Object.keys(turnPossibleCategories).includes(scoreCategory)) {
            if(turnPossibleCategories[scoreCategory].value === 0) { // handle zero confirmation
                confirmZeroModal.show();
                $('#confirm-zero-button').unbind('click').click({ playerDisplayName: displayName, scoreCategory }, handleConfirmZeroClicked);
            }
            else {
                if(settings.confirmScores && (!scoreClickedOnce || scoreCategory !== previousClickedScoreCategory)) { // handle score confirmation if setting is enabled
                    if($previousClickedScoreContainer) {
                        $previousClickedScoreContainer.text(previousClickedScoreValue);
                        $previousClickedScoreContainer.removeClass('confirming-score');
                    }

                    scoreClickedOnce = true;
                    $previousClickedScoreContainer = $(this);
                    previousClickedScoreCategory = scoreCategory;
                    previousClickedScoreValue = $(this).text();
                    
                    $(this).addClass('confirming-score');
                }
                else { // select score if confirmed or confirmScores setting is false
                    selectScore(scoreCategory);
                }
            }
        }
    }
}

function handleConfirmZeroClicked(event) {
    selectScore(event.data.scoreCategory);
}

function selectScore(scoreCategory) {
    resetConfirmingScore();
    socket.emit('selectScore', { gameId: settings.gameId, uuid: settings.uuid, scoreCategory });
    $('#confirm-zero-button').unbind('click'); // remove the confirm button's previously attached click handler
}

function handleBackgroundColorChange() {
    $('#roll-dice-button').removeClass(settings.isBackgroundLight ? 'btn-light' : 'btn-dark').addClass(settings.isBackgroundLight ? 'btn-dark' : 'btn-light');
    $('.waiting-player-container').removeClass(settings.isBackgroundLight ? 'bg-light text-dark' : 'bg-dark text-light').addClass(settings.isBackgroundLight ? 'bg-dark text-light' : 'bg-light text-dark');
}

function handleDiceColorChange() {
    const isDiceColorLight = isLight(settings.diceColor, 0.25);
    const circleColor = isDiceColorLight ? 'var(--bs-dark)' : 'var(--bs-light)';

    for(let i=1; i<=6; i++) {
        const $symbolElement = $(`#dice-${i}`);

        setDiceSymbolColors($symbolElement, settings.diceColor, circleColor);
    }
}

function updateScoreTable(players) { // updates the score-table for the game and the modal
    let playerHeadingsHtml = '';
    let playerScoresHtml = '';
    let clicablePlayerScoresHtml = '';

    players.forEach(player => {
        if(player !== null) {
            const playerStripped = player.replace(/\s+/g, '');
            playerHeadingsHtml += `<th class="player-heading overflow-hidden text-truncate ${playerStripped}" scope="col" data-bs-title="${player}" data-bs-toggle="tooltip" data-bs-placement="top">${player}</th>`;
            playerScoresHtml += `<td class="player-score text-center fw-bold ${playerStripped}"></td>`;
            clicablePlayerScoresHtml += `<td class="player-score text-center fw-bold cursor-pointer cell-hover ${playerStripped}"></td>`;
        }
    });

    $('.score-table .player-headings').html(`<th></th>${playerHeadingsHtml}`);

    $('.score-table .ones').html(`<td class="score-category cursor-pointer cell-hover">Ones</td>${clicablePlayerScoresHtml}`);
    $('.score-table .twos').html(`<td class="score-category cursor-pointer cell-hover">Twos</td>${clicablePlayerScoresHtml}`);
    $('.score-table .threes').html(`<td class="score-category cursor-pointer cell-hover">Threes</td>${clicablePlayerScoresHtml}`);
    $('.score-table .fours').html(`<td class="score-category cursor-pointer cell-hover">Fours</td>${clicablePlayerScoresHtml}`);
    $('.score-table .fives').html(`<td class="score-category cursor-pointer cell-hover">Fives</td>${clicablePlayerScoresHtml}`);
    $('.score-table .sixes').html(`<td class="score-category cursor-pointer cell-hover">Sixes</td>${clicablePlayerScoresHtml}`);
    $('.score-table .totalNoBonus').html(`<td class="score-category fw-bold">Total (63)</td>${playerScoresHtml}`);
    $('.score-table .bonus').html(`<td class="score-category fw-bold">Bonus (35)</td>${playerScoresHtml}`);

    $('.score-table .threeOfAKind').html(`<td class="score-category cursor-pointer cell-hover">3 of a Kind</td>${clicablePlayerScoresHtml}`);
    $('.score-table .fourOfAKind').html(`<td class="score-category cursor-pointer cell-hover">4 of a Kind</td>${clicablePlayerScoresHtml}`);
    $('.score-table .fullHouse').html(`<td class="score-category cursor-pointer cell-hover">Full House</td>${clicablePlayerScoresHtml}`);
    $('.score-table .smallStraight').html(`<td class="score-category cursor-pointer cell-hover">Sm. Straight</td>${clicablePlayerScoresHtml}`);
    $('.score-table .largeStraight').html(`<td class="score-category cursor-pointer cell-hover">Lg. Straight</td>${clicablePlayerScoresHtml}`);
    $('.score-table .chance').html(`<td class="score-category cursor-pointer cell-hover">Chance</td>${clicablePlayerScoresHtml}`);
    $('.score-table .yahtzee').html(`<td class="score-category cursor-pointer cell-hover">Yahtzee</td>${clicablePlayerScoresHtml}`);

    $('.score-table .totalScore').html(`<td class="score-category fw-bold">Total Score</td>${playerScoresHtml}`);

    setTooltipTheme(settings.isBackgroundLight);
}

function addRolledDice(dice) {
    Object.keys(dice).forEach(diceId => {
        const diceVal = dice[diceId];
        diceToRoll[diceId] = diceVal;
        delete keptDice[diceId];
        $('#rolled-dice-container').append($('#' + diceId));
    });
    
    if(Object.keys(diceToRoll).length !== 0) {
        $('#roll-dice-button').prop('disabled', false);
    }
}

function setKeptDice(dice) {
    Object.keys(dice).forEach(diceId => {
        const diceVal = dice[diceId];
        $(`#${diceId} use`).attr('href', `#dice-${diceVal}`);
        keptDice[diceId] = diceVal;
        delete diceToRoll[diceId];
    });
    
    if(Object.keys(diceToRoll).length === 0) {
        $('#roll-dice-button').prop('disabled', true);
    }

    const sortedDice = [];
    for(let dice in keptDice) {
        sortedDice.push([dice, keptDice[dice]]);
    }
    sortedDice.sort(function(a, b) {
        return a[1] - b[1];
    });

    sortedDice.forEach(dice => {
        $('#kept-dice-container').append($('#' + dice[0]));
    });
}

function resetRolledDice() {
    Object.keys(keptDice).forEach(key => {
        $('#rolled-dice-container').append($(`#${key}`));
    });
    keptDice = {};
}

function setRolledDice(rolledDice) {
    Object.keys(rolledDice).forEach(key => {
        $(`#${key} use`).attr('href', `#dice-${rolledDice[key]}`);
        diceToRoll[key] = rolledDice[key];
    });
}

function resetConfirmingScore() {
    $('.confirming-score').removeClass('confirming-score');
    scoreClickedOnce = false;
    $previousClickedScoreContainer = null;
    previousClickedScoreCategory = '';
    previousClickedScoreValue = '';
}

function addLogMessage(message) {
    if(message) {
        const logMessages = document.getElementById('log-messages');
        const isScrolledToBottom = Math.ceil(logMessages.offsetHeight + logMessages.scrollTop) >= logMessages.scrollHeight;

        $('#log-messages').append(`<span class="log-message${showAltMessageBackground ? ' alt-message-background' : ''}">${message}</span>`);
        showAltMessageBackground = !showAltMessageBackground;

        if(isScrolledToBottom) { // Only auto-scroll to bottom of messages if user is already scrolled to bottom.
            $('#log-messages').scrollTop($('#log-messages').scrollTop() + $('#log-messages').height());
        }
    }
}