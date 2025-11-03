import { socket, settings, createToastMessage } from './global.js';

let tries = 0;
let maxRetries = 3;

let confirmButtonTooltip;

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

socket.on('unauthenticatedUserConnected', function() {
    $('#login-info-container').removeClass('invisible');
    handleDisplayNameInputChange(settings.displayName);
});

socket.on('authenticatedUserConnected', function(data) {
    const username = data.username;
    const displayName = settings.displayName || username;

    $('#stats-button').prop('disabled', false);

    handleDisplayNameInputChange(displayName);
    localStorage.setItem('displayName', displayName);
    settings.displayName = displayName;

    // if(settings.displayName) { // TODO: replace above with this block, but need to fix issue where "Guest" is set as display name (create room logic reading from localStorage?) when using pre-populated username
    //     handleDisplayNameInputChange(settings.displayName);
    //     localStorage.setItem('displayName', settings.displayName);
    //     settings.displayName = settings.displayName;
    // }
    // else if(username) {
    //     handleDisplayNameInputChange(username);
    // }
});

socket.on('updateOpenRooms', function(data) {
    const rooms = data.rooms;
    let openRoomsHtml = '';
    const roomBackgroundColor = settings.isBackgroundLight ? 'bg-dark' : 'bg-light';
    const roomTextColor = settings.isBackgroundLight ? 'text-light' : 'text-dark';
    const roomJoinButtonColor = settings.isBackgroundLight ? 'btn-light' : 'btn-dark';

    rooms.forEach(room => {
        const numPlayers = room.numConnected;
        const maxPlayers = room.numMax;
        const leaderDisplayName = room.leaderDisplayName;
        const gameId = room.gameId;
        
        const numPlayersHtml = `<div class="d-flex align-items-center ms-xxl-2 ms-1">${numPlayers}/${maxPlayers}</div>`;
        const leaderDisplayNameHtml = `<div class="d-flex align-items-center flex-grow-1 px-xxl-3 px-2"><span class="room-leader-display-name">${leaderDisplayName}</span></div>`;
        const joinRoomButtonHtml = `<div class="d-flex align-items-center"><button class="btn ${roomJoinButtonColor} w-100 rounded-pill join-room-button px-xxl-4 px-3" type="button" value="${gameId}" data-numplayers="${numPlayers}" data-maxplayers="${maxPlayers}" data-displayname="${leaderDisplayName}" ${numPlayers === maxPlayers ? 'disabled' : ''}>Join</button></div>`;
        openRoomsHtml += `<div class="d-flex ${roomBackgroundColor} ${roomTextColor} w-100 rounded-pill shadow mb-xxl-3 mb-2 room">${numPlayersHtml}${leaderDisplayNameHtml}${joinRoomButtonHtml}</div>`;

        if(parseInt($('#join-room-info-container').data('gameId'), 10) === gameId) {
            $('#room-info-players').html(`${numPlayers}/${maxPlayers}`);
            $('#room-info-leader-display-name').html(leaderDisplayName);
        }
    });

    $('#open-rooms-container').html(openRoomsHtml);

    $('#no-rooms-container').removeClass(rooms.length ? 'd-flex' : 'd-none').addClass(rooms.length ? 'd-none' : 'd-flex');

    $('.join-room-button').click(function() {
        const gameId = $(this).val();
        $('#join-room-info-container').data('gameId', gameId);
        $('#room-info-players').html(`${$(this).data('numplayers')}/${$(this).data('maxplayers')}`);
        $('#room-info-leader-display-name').html($(this).data('displayname'));
        $('#join-room-confirm-button').val(gameId);

        $('#main-container').fadeOut(100, () => {
            showJoinRoomContainer();
        });
    });
});

socket.on('createRoomResponse', function(data) {
    const gameId = data.gameId;
    const error = data.error;

    if(gameId) {
        localStorage.setItem('gameId', gameId);
        window.location.href = `/play/${gameId}`;
    }
    else {
        createToastMessage(`Error: ${error}`, true);
    }
});

socket.on('joinRoomResponse', function(data) {
    const gameId = data.gameId;
    const error = data.error;

    if(gameId) {
        localStorage.setItem('gameId', gameId);
        window.location.href = `/play/${gameId}`;
    }
    else {
        createToastMessage(`Error: ${error}`, true);
    }
});

$(document).ready(function() {
    handleBackgroundColorChange();
    $('#main-container').removeClass('d-none');

    socket.emit('getOpenRoomInfo');

    $('#background-color').on('input', () => {
        handleBackgroundColorChange();
    });

    $('#header-title-container').click(() => {
        $('.content-container').fadeOut(100, () => {
            $('.content-container').hide();
            $('#main-container').fadeIn(100);
        });
    });

    $('#single-button').click(function() {
        socket.emit('createRoomRequest', { maxPlayers: 1, uuid: settings.uuid });
    });

    $('#create-room-button').click(function () {
        $('#main-container').fadeOut(100, () => {
            showCreateRoomContainer();
        });
    });

    $('#stats-button').click(function() {
        window.location.href = '/stats';
    });

    $('#leaderboard-button').click(function() {
        window.location.href = '/leaderboard';
    });

    $('#display-name-input').on('input', function() {
        handleDisplayNameInputChange($(this).val());
    });

    $('#display-name-input').on('focusout', function() {
        const trimmedDisplayName = $(this).val().trim();
        $('#display-name-input').val(trimmedDisplayName);
        settings.displayName = trimmedDisplayName;
        localStorage.setItem('displayName', trimmedDisplayName);
    });

    $('#create-room-confirm-button').click(function() {
        const maxPlayers = $('input[name="num-players"]:checked').val();
        const displayName = $('#display-name-input').val().trim();
        socket.emit('createRoomRequest', { maxPlayers, uuid: settings.uuid, displayName });
    });

    $('#join-room-confirm-button').click(function() {
        const gameId = $(this).val();
        const displayName = $('#display-name-input').val().trim();
        socket.emit('joinRoomRequest', { gameId, displayName });
    });
});

function handleBackgroundColorChange() {
    $('.room').removeClass(settings.isBackgroundLight ? 'bg-light text-dark' : 'bg-dark text-light').addClass(settings.isBackgroundLight ? 'bg-dark text-light' : 'bg-light text-dark');
    $('.join-room-button').removeClass(settings.isBackgroundLight ? 'btn-dark' : 'btn-light').addClass(settings.isBackgroundLight ? 'btn-light' : 'btn-dark');
}

function showCreateRoomContainer() {
    $('#create-join-room-heading').text('Create Room');
    $('#join-room-info-container').addClass('d-none');
    $('#max-players-container').show();
    $('#create-room-confirm-button').show();
    $('#join-room-confirm-button').hide();
    $('#create-join-room-container').fadeIn(100);
}

function showJoinRoomContainer() {
    $('#create-join-room-heading').text('Join Room');
    $('#join-room-info-container').removeClass('d-none');
    $('#max-players-container').hide();
    $('#create-room-confirm-button').hide();
    $('#join-room-confirm-button').show();
    $('#create-join-room-container').fadeIn(100);
}

function handleDisplayNameInputChange(inputValue) {
    const trimmedDisplayName = inputValue.trimStart().replace(/\s+/g, ' ').slice(0, 12);
    const displayNameLength = trimmedDisplayName.length;
    const isDisplayNameEmpty = displayNameLength === 0;
    const tooltipTitle = isDisplayNameEmpty ? 'Display Name is required' : '';

    $('#display-name-input').val(trimmedDisplayName);
    $('#create-room-confirm-button').prop('disabled', isDisplayNameEmpty);
    $('#join-room-confirm-button').prop('disabled', isDisplayNameEmpty);
    $('#display-name-num-characters').text(displayNameLength);
    $('#confirm-button-wrapper').prop('title', tooltipTitle);

    if(!isDisplayNameEmpty && confirmButtonTooltip) {
        confirmButtonTooltip.dispose();
        confirmButtonTooltip = null;
    }

    if(isDisplayNameEmpty && !confirmButtonTooltip) {
        confirmButtonTooltip = new bootstrap.Tooltip($('#confirm-button-wrapper')[0]);
    }
}