import mysql from 'mysql2/promise';

class DBUtil {
    constructor() {}

    async executeQuery(sql, params = []) {
        let connection;

        try {
            connection = await mysql.createConnection({
                host: process.env.MYSQLHOST,
                user: process.env.MYSQLUSER,
                password: process.env.MYSQLPASSWORD,
                database: process.env.MYSQLDATABASE,
                port: process.env.MYSQLPORT
            });

            const [rows] = await connection.execute(sql, params);
            return rows;
        }
        catch(err) {
            console.error('Database query error:', err.message);
            throw err;
        }
        finally {
            if(connection) {
                try {
                    await connection.end();
                }
                catch(err) {
                    console.warn('Error closing connection:', err.message);
                }
            }
        }
    }

    async getUser(usernameOrEmail) {
        const users = await this.executeQuery('SELECT * FROM users WHERE username = ? OR email = ?', [usernameOrEmail, usernameOrEmail]);
        return users && users[0] ? users[0] : null;
    }

    async getUserById(userId) {
        const users = await this.executeQuery('SELECT * FROM users WHERE id = ?', [userId]);
        return users && users[0] ? users[0] : null;
    }

    insertUser(username, password, email) {
        return this.executeQuery('INSERT INTO users(username, password, email) VALUES(?, ?, ?)', [username, password, email]);
    }

    updateVerificationSendDate(email) {
        const date = new Date();
        const timestamp = date.toISOString().split('T')[0] + ' ' + date.toTimeString().split(' ')[0];
        return this.executeQuery('UPDATE users SET verification_send_date = ? WHERE email = ?', [timestamp, email])
    }

    verifyUser(userId) {
        return this.executeQuery('UPDATE users SET is_verified = 1 WHERE id = ?', [userId]);
    }

    updatePassword(userId, password) {
        return this.executeQuery('UPDATE users SET password = ? WHERE id = ?', [password, userId]);
    }

    insertSingleGame(userId, bonus, numYahtzees, score) {
        return this.executeQuery('INSERT INTO single_games(user_id, bonus, yahtzees, score) VALUES(?, ?, ?, ?)', [userId, bonus, numYahtzees, score]);
    }

    insertMultiGame(userId, bonus, numYahtzees, score, win) {
        return this.executeQuery('INSERT INTO multi_games(user_id, bonus, yahtzees, score, win) VALUES(?, ?, ?, ?, ?)', [userId, bonus, numYahtzees, score, win]);
    }

    getSingleStats(userId) {
        return this.executeQuery(`
            SELECT COUNT(user_id) AS games,
                   CAST(SUM(bonus) AS UNSIGNED) AS bonuses,
                   CAST(SUM(yahtzees) AS UNSIGNED) AS yahtzees,
                   ROUND(AVG(score)) AS average_score
            FROM single_games
            WHERE user_id = ?
        `, [userId]);
    }

    getMultiStats(userId) {
        return this.executeQuery(`
            SELECT COUNT(user_id) AS games,
                   CAST(SUM(bonus) AS UNSIGNED) AS bonuses,
                   CAST(SUM(yahtzees) AS UNSIGNED) AS yahtzees,
                   ROUND(AVG(score)) AS average_score,
                   CAST(SUM(win) AS UNSIGNED) AS wins
            FROM multi_games
            WHERE user_id = ?
        `, [userId]);
    }

    getSingleTopScores(userId) {
        return this.executeQuery(`
            SELECT score,
                   created_date
            FROM single_games
            WHERE user_id = ?
            ORDER BY score DESC, created_date ASC
            LIMIT 10
        `, [userId]);
    }

    getMultiTopScores(userId) {
        return this.executeQuery(`
            SELECT score,
                   created_date
            FROM multi_games
            WHERE user_id = ?
            ORDER BY score DESC, created_date ASC
            LIMIT 10
        `, [userId]);
    }

    getSingleLeaderboard() {
        return this.executeQuery(`
            SELECT users.username,
                   single_games.score,
                   single_games.created_date
            FROM single_games
            INNER JOIN users ON users.id=single_games.user_id
            ORDER BY score DESC, created_date ASC
            LIMIT 20
        `);
    }

    getMultiLeaderboard() {
        return this.executeQuery(`
            SELECT users.username,
                   multi_games.score,
                   multi_games.created_date
            FROM multi_games
            INNER JOIN users ON users.id=multi_games.user_id
            ORDER BY score DESC, created_date ASC
            LIMIT 20
        `);
    }
}

const instance = new DBUtil();
Object.freeze(instance);
export default instance;