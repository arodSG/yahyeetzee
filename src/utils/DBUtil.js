import pkg from "pg";
const { Client } = pkg;

class DBUtil {
    constructor() {}

    async executeQuery(sql, params = []) {
        let client;

        try {
            client = new Client({
                connectionString: process.env.DB_URL,
                ssl: { rejectUnauthorized: false }
            });

            await client.connect();

            const result = await client.query(sql, params);

            return result.rows;
        }
        catch(err) {
            console.error('Database query error:', err.message);
            throw err;
        }
        finally {
            if(client) {
                try {
                    await client.end();
                }
                catch(err) {
                    console.warn('Error closing connection:', err.message);
                }
            }
        }
    }

    async getUser(usernameOrEmail) {
        const users = await this.executeQuery('SELECT * FROM users WHERE username = $1 OR email = $1', [usernameOrEmail]);
        return users?.[0] ?? null;
    }

    async getUserById(userId) {
        const users = await this.executeQuery('SELECT * FROM users WHERE id = $1', [userId]);
        return users?.[0] ?? null;
    }

    insertUser(username, password, email) {
        return this.executeQuery('INSERT INTO users (username, password, email) VALUES ($1, $2, $3)', [username, password, email]);
    }

    updateVerificationSendDate(email) {
        const timestamp = new Date().toISOString();
        return this.executeQuery('UPDATE users SET verification_send_date = $1 WHERE email = $2', [timestamp, email]);
    }

    verifyUser(userId) {
        return this.executeQuery('UPDATE users SET is_verified = TRUE WHERE id = $1', [userId]);
    }

    updatePassword(userId, password) {
        return this.executeQuery('UPDATE users SET password = $1 WHERE id = $2', [password, userId]);
    }

    insertSingleGame(userId, bonus, numYahtzees, score) {
        return this.executeQuery('INSERT INTO single_games (user_id, bonus, yahtzees, score) VALUES ($1, $2, $3, $4)', [userId, bonus, numYahtzees, score]);
    }

    insertMultiGame(userId, bonus, numYahtzees, score, win) {
        return this.executeQuery('INSERT INTO multi_games (user_id, bonus, yahtzees, score, win) VALUES ($1, $2, $3, $4, $5)', [userId, bonus, numYahtzees, score, win]);
    }

    getSingleStats(userId) {
        return this.executeQuery(`
            SELECT COUNT(*) AS games,
                   SUM(CASE WHEN bonus THEN 1 ELSE 0 END) AS bonuses,
                   SUM(yahtzees) AS yahtzees,
                   ROUND(AVG(score)) AS average_score
            FROM single_games
            WHERE user_id = $1
        `, [userId]);
    }

    getMultiStats(userId) {
        return this.executeQuery(`
            SELECT COUNT(*) AS games,
                   SUM(CASE WHEN bonus THEN 1 ELSE 0 END) AS bonuses,
                   SUM(yahtzees) AS yahtzees,
                   ROUND(AVG(score)) AS average_score,
                   SUM(CASE WHEN win THEN 1 ELSE 0 END) AS wins
            FROM multi_games
            WHERE user_id = $1
        `, [userId]);
    }

    getSingleTopScores(userId) {
        return this.executeQuery(`
            SELECT score,
                   created_date
            FROM single_games
            WHERE user_id = $1
            ORDER BY score DESC, created_date ASC
            LIMIT 10
        `, [userId]);
    }

    getMultiTopScores(userId) {
        return this.executeQuery(`
            SELECT score,
                   created_date
            FROM multi_games
            WHERE user_id = $1
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
            INNER JOIN users ON users.id = single_games.user_id
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
            INNER JOIN users ON users.id = multi_games.user_id
            ORDER BY score DESC, created_date ASC
            LIMIT 20
        `);
    }
}

const instance = new DBUtil();
Object.freeze(instance);
export default instance;