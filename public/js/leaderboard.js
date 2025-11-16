import { createToastMessage } from './global.js';

$(document).ready(function() {
    getLeaderboardRequest();
});

function getLeaderboardRequest() {
    $.get('/api/get-leaderboard', response => {
        if(response.status === 200) {
            const singleScores = response.singleScores || [];
            const multiScores = response.multiScores || [];

            if(singleScores.length) {
                const singleLeaderboardTableBodyHtml = getLeaderboardTableHtml(singleScores);
                $('#single-leaderboard-table-body').html(singleLeaderboardTableBodyHtml);
                $('#single-no-games-found').addClass('d-none');
                $('#single-leaderboard-table').removeClass('d-none');
            }

            if(multiScores.length) {
                const multiLeaderboardTableBodyHtml = getLeaderboardTableHtml(multiScores);
                $('#multi-leaderboard-table-body').html(multiLeaderboardTableBodyHtml);
                $('#multi-no-games-found').addClass('d-none');
                $('#multi-leaderboard-table').removeClass('d-none');
            }
        }
    })
    .fail(() => {
        createToastMessage('Error: Failed to get leaderboard data', true);
    })
    .always(() => {
        $('#loading-spinner').addClass('d-none');
        $('#leaderboard-container').removeClass('d-none');
    });
}

function getLeaderboardTableHtml(leaderboardArr) {
    let tableBodyHtml = '';

    leaderboardArr.forEach((scoreData, index) => {
        const name = scoreData.username;
        const score = scoreData.score;
        const createdDate = scoreData.created_date;
        const date = new Date(createdDate);
        const formattedDate = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear().toString().slice(-2)}`;
        tableBodyHtml += `<tr><th scope="row">${index + 1}</th><td><a class="fst-italic" href="/stats?user=${name}">${name}</a></td><td>${score}</td><td>${formattedDate}</td></tr>`;
    });

    return tableBodyHtml;
}