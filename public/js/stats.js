import { getQueryParam, createToastMessage } from './global.js';

$(document).ready(function() {
    getStatsRequest();
});

function setStatPercentageTooltips(singleStats, multiStats) {
    const setStatPercentageTooltip = (elementSelector, percentage) => {
        if(!isNaN(percentage)) {
            const tooltipElement = document.querySelector(elementSelector);
            tooltipElement.title = `${percentage}%`;
            new bootstrap.Tooltip(tooltipElement);
        }
    }
    const singleBonusPercentage = ((singleStats.bonuses / singleStats.games) * 100).toFixed(0);
    const singleYahtzeePercentage = ((singleStats.yahtzees / singleStats.games) * 100).toFixed(0);
    const multiBonusPercentage = ((multiStats.bonuses / multiStats.games) * 100).toFixed(0);
    const multiYahtzeePercentage = ((multiStats.yahtzees / multiStats.games) * 100).toFixed(0);
    const multiWinPercentage = ((multiStats.wins / multiStats.games) * 100).toFixed(0);
    const percentages = { 'single-bonuses': singleBonusPercentage, 'single-yahtzees': singleYahtzeePercentage, 'multi-bonuses': multiBonusPercentage, 'multi-yahtzees': multiYahtzeePercentage, 'multi-wins': multiWinPercentage };

    Object.keys(percentages).forEach(elementSelector => setStatPercentageTooltip(`#${elementSelector}`, percentages[elementSelector]));
}

function getStatsRequest() {
    const userQueryParam = getQueryParam('user');
    const requestParams = userQueryParam ? { user: userQueryParam.trim() } : {};

    $.ajax({
        url: '/api/get-stats',
        type: 'GET',
        data: requestParams,
        contentType: 'application/json',
        success: function(response) {
            if(response.status === 200) {
                const username = response.username ;
                const singleStats = response.singleStats;
                const singleTopScores = response.singleTopScores || [];
                const multiStats = response.multiStats;
                const multiTopScores = response.multiTopScores || [];

                if(username) {
                    $('#stats-heading').text(username.toLowerCase().endsWith('s') ? `${username}' Stats` : `${username}'s Stats`);
                }

                $('#single-games').text(singleStats.games != null ? singleStats.games : '-');
                $('#single-bonuses').text(singleStats.bonuses != null ? singleStats.bonuses : '-');
                $('#single-yahtzees').text(singleStats.yahtzees != null ? singleStats.yahtzees : '-');
                $('#single-average').text(singleStats.average_score != null ? singleStats.average_score : '-');
                
                $('#multi-games').text(multiStats.games != null ? multiStats.games : '-');
                $('#multi-bonuses').text(multiStats.bonuses != null ? multiStats.bonuses : '-');
                $('#multi-yahtzees').text(multiStats.yahtzees != null ? multiStats.yahtzees : '-');
                $('#multi-average').text(multiStats.average_score != null ? multiStats.average_score : '-');
                $('#multi-wins').text(multiStats.wins != null ? multiStats.wins : '-');

                setStatPercentageTooltips(singleStats, multiStats);

                if(singleTopScores.length) {
                    const singleTopScoresTableBodyHtml = getTopScoresTableHtml(singleTopScores);
                    $('#single-top-scores-table-body').html(singleTopScoresTableBodyHtml);
                    $('#single-no-games-found').addClass('d-none');
                    $('#single-top-scores-table').removeClass('d-none');
                }

                if(multiTopScores.length) {
                    const multiTopScoresTableBodyHtml = getTopScoresTableHtml(multiTopScores);
                    $('#multi-top-scores-table-body').html(multiTopScoresTableBodyHtml);
                    $('#multi-no-games-found').addClass('d-none');
                    $('#multi-top-scores-table').removeClass('d-none');
                }
            }
        },
        error: function(error) {
            const errorMessage = error?.responseJSON?.error || 'Failed to get stats';
            createToastMessage(`Error: ${errorMessage}`, true);
        }
    })
    .always(() => {
        $('#loading-spinner').addClass('d-none');
        $('.stats-container').removeClass('d-none');
    });
}

function getTopScoresTableHtml(topScoresArr) {
    let tableBodyHtml = '';

    topScoresArr.forEach((scoreData, index) => {
        const score = scoreData.score;
        const createdDate = scoreData.created_date;
        const date = new Date(createdDate);
        const formattedDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear().toString().slice(-2)}`;
        tableBodyHtml += `<tr><th class="col" scope="row">${index + 1}</th><td class="col">${score}</td><td class="col">${formattedDate}</td></tr>`;
    });

    return tableBodyHtml;
}