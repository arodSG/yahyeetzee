// export const socket = io('https://yahtzee.arodsg.com', { reconnection: false });
import configPublic from '/config_public.js';
export const socket = io(configPublic.socket.url, {
    reconnection: false,
    auth: {
        token: getCookie('loggedInToken')
    }
});
export const settings = {};
let settingsModal;

loadSettings();

socket.on('connect', () => {
    console.log('connected');
});

socket.on('unauthenticatedUserConnected', function() {
    $('.dropdown').removeClass('d-none');
});

socket.on('authenticatedUserConnected', function(data) {
    const username = data.username;
    $('#dropdown-button-text').text(username);
    $('#dropdown-log-in').hide();
    $('#dropdown-log-out').show();
    $('.dropdown').removeClass('d-none');

    if(sessionStorage.getItem('redirectedAfterLogin')) {
        createLoggedInToast(username);
        sessionStorage.removeItem('redirectedAfterLogin');
    }
});

$(window).on('pageshow', function(event) {
    const navigationType = performance.getEntriesByType("navigation")[0].type;

    if(event.originalEvent.persisted || navigationType === 'back_forward') {
        processSettings();
    }
});

$(document).ready(function() {
    settingsModal = $('#settings-modal').length ? new bootstrap.Modal($('#settings-modal'), {}) : null;

    processSettings();

    $('#header-title-container').click(() => {
        if(window.location.pathname !== '/') {
            window.location.href = '/';
        }
    });

    $('#dropdown-settings').click(() => {
        if(settingsModal) {
            settingsModal.show();
        }
    });

    $('#dropdown-log-out').click(function() {
        $.ajax({
            url: '/auth/logout',
            type: 'POST',
            contentType: 'application/json',
            success: function(data) {
                sessionStorage.setItem('redirectedAfterLogout', true);
                $('#stats-button').prop('disabled', true);
                window.location.reload();
            },
            error: function(xhr) {
                const response = JSON.parse(xhr.responseText);
                alert(`Error: ${response.message}`);
            }
        });
    });

    $('#background-color').on('input', function() {
        const hexString = $(this).val();
        settings.backgroundColor = hexString;
        handleBackgroundColorChange(settings.backgroundColor);
    });

    $('#dice-color').on('input', function() {
        document.documentElement.style.setProperty('--a', $(this).val()); // TODO: figure out why removing this line causes dice color to not update on input change (only an issue with Chrome)
        settings.diceColor = $(this).val();
        localStorage.setItem('diceColor', settings.diceColor);
    });

    $('#confirm-scores-switch').change(function() {
        settings.confirmScores = this.checked;
        localStorage.setItem('confirmScores', settings.confirmScores);
    });

    $('#volume-slider').change(function() {
        settings.volumeLevel = this.value; // 25 is max
        localStorage.setItem('volumeLevel', settings.volumeLevel);
    });

    if(sessionStorage.getItem('redirectedAfterLogout')) {
        createLoggedOutToast();
        sessionStorage.removeItem('redirectedAfterLogout');
    }

    $('.toggle-password').on('click', function() {
        const $passInput = $(this).siblings('.pass-input').first();
    
        if($passInput.val()) {
            const currentType = $passInput.attr('type');
            $passInput.attr('type', currentType === 'password' ? 'text' : 'password');
        }
    });
});

function createLoggedInToast(username) {
    const toastBody = `Logged in as <span class="fw-bold">${username}</span>`;
    createToastMessage(toastBody, false);
}

function createLoggedOutToast() {
    const toastBody = `Successfully logged out`;
    createToastMessage(toastBody, false);
}

export function createToastMessage(toastBody, isError) {
    const toastSuccessBackground = settings.isBackgroundLight ? 'text-bg-dark' : 'text-bg-light';
    const closeButtonTheme = settings.isBackgroundLight ? 'dark' : 'light';
    const toast = $($.parseHTML(`<div class="toast ${isError ? 'text-bg-danger' : toastSuccessBackground} border-0" data-bs-theme="${closeButtonTheme}" role="alert" aria-live="assertive" aria-atomic="true">
        <div class="d-flex px-1 py-1">
            <div class="toast-body">${toastBody}</div>
            <button type="button" class="btn-close me-1 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    </div>`));

    $('.toast-container').append(toast);
    bootstrap.Toast.getOrCreateInstance(toast).show();
    
    $(toast).on('hidden.bs.toast', function(event) {
        $(this).remove();
    });
}

function loadSettings() {
    const defaults = { backgroundColor: '#212529', diceColor: '#F8F9FA', confirmScores: false, volumeLevel: 25, displayName: '', uuid: '', gameId: null };
    settings.backgroundColor = localStorage.getItem('--bs-body-bg') ? localStorage.getItem('--bs-body-bg') : defaults.backgroundColor;
    settings.diceColor = localStorage.getItem('diceColor') ? localStorage.getItem('diceColor') : defaults.diceColor;
    settings.confirmScores = localStorage.getItem('confirmScores') ? localStorage.getItem('confirmScores') === 'true' : defaults.confirmScores;
    settings.volumeLevel = localStorage.getItem('volumeLevel') ? localStorage.getItem('volumeLevel') : defaults.volumeLevel;
    settings.displayName = localStorage.getItem('displayName') || '';
    settings.uuid = localStorage.getItem('uuid') ? localStorage.getItem('uuid') : '';
    settings.gameId = localStorage.getItem('gameId') ? localStorage.getItem('gameId') : null;

    setGlobalVar('--bs-body-bg', settings.backgroundColor);
}

function processSettings() {
    $('#background-color').val(settings.backgroundColor);
    handleBackgroundColorChange(settings.backgroundColor);

    $('#dice-color').val(settings.diceColor);

    $('#confirm-scores-switch').prop('checked', settings.confirmScores);

    $('#volume-slider').val(settings.volumeLevel);

    if(!settings.uuid) {
        localStorage.removeItem('gameId'); // reset stored gameId if UUID is refreshed
        socket.emit('getUUID');
    }

    if(settings.gameId) {
        const pathArray = window.location.pathname.split('/').filter(Boolean);

        if(pathArray.length && pathArray[0].toLowerCase() === 'play') {
            socket.emit('updateSocketId', { gameId: settings.gameId, uuid: settings.uuid });
        }
    }
}

socket.on('setUUID', data => {
    const uuid = data.uuid;
    settings.uuid = uuid;
    localStorage.setItem('uuid', uuid);
});

function handleBackgroundColorChange(backgroundColor) {
    settings.isBackgroundLight = isLight(backgroundColor);
    const textColor = settings.isBackgroundLight ? 'var(--bs-dark)' : 'var(--bs-light)';
    setGlobalVar('--bs-body-color', textColor);
    setGlobalVar('--bs-body-bg', backgroundColor);
    setGlobalVar('--bs-heading-color', textColor);
    setGlobalVar('--bs-tooltip-bg', textColor);
    setGlobalVar('--bs-tooltip-color', 'red');
    $('.dropdown-menu').attr('data-bs-theme', settings.isBackgroundLight ? 'dark' : 'light');
    $('.button-main, .button-main-sm').removeClass(settings.isBackgroundLight ? 'btn-light' : 'btn-dark').addClass(settings.isBackgroundLight ? 'btn-dark' : 'btn-light');
    setTooltipTheme();
    changeHeaderDiceColor(settings.isBackgroundLight);
}

function changeHeaderDiceColor(isPageBackgroundLight) {
    const diceBackgroundColor = isPageBackgroundLight ? 'var(--bs-dark)' : 'var(--bs-light)';
    const diceCircleColor = isPageBackgroundLight ? 'var(--bs-light)' : 'var(--bs-dark)';
    const $symbolElement = $(`#header-dice`);
    setDiceSymbolColors($symbolElement, diceBackgroundColor, diceCircleColor, true);
}

export function setDiceSymbolColors($symbolElement, backgroundColor, circleColor, isHeader=false) {
    const $background = $symbolElement.find(`${ isHeader ? '.header-dice-background' : '.dice-background' }`);

    $symbolElement.css('fill', circleColor); // instead of applying fill to each .dice-circle element

    if($background.length) {
        $background.css('fill', backgroundColor);
    }
}

export function setTooltipTheme() {
    const themeClass = settings.isBackgroundLight ? 'custom-tooltip-dark' : 'custom-tooltip';
    const tooltipElements = document.querySelectorAll('[data-bs-toggle="tooltip"]');

    tooltipElements.forEach(tooltipElement => {
        const existingTooltipInstance = bootstrap.Tooltip.getInstance(tooltipElement);
        if(existingTooltipInstance) {
            existingTooltipInstance.dispose();
        }

        tooltipElement.setAttribute('data-bs-custom-class', themeClass);
        new bootstrap.Tooltip(tooltipElement);
    });
}

function setGlobalVar(cssVar, value) {
    const root = document.documentElement;
    root.style.setProperty(cssVar, value);
    localStorage.setItem(cssVar, value);
}

export function isLight(color, threshold=0.5) {
    if(color.length == 7) {
        const rgb = [
            parseInt(color.substring(1, 3), 16),
            parseInt(color.substring(3, 5), 16),
            parseInt(color.substring(5), 16)
        ];
        const luminance =
            (0.2126 * rgb[0]) / 255 +
            (0.7152 * rgb[1]) / 255 +
            (0.0722 * rgb[2]) / 255;
        return luminance > threshold;
    }
    return false;
}

export function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}