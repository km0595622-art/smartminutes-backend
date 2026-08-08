const db = require("../config/db");

async function createDeposit(userId, amount, phone) {

    const query = `
        INSERT INTO deposits
        (user_id, amount, phone, status)
        VALUES ($1, $2, $3, 'pending')
        RETURNING id, user_id, amount, phone, status, created_at;
    `;

    const values = [userId, amount, phone];

    const result = await db.query(query, values);

    return result.rows[0];
}


async function findDepositById(id) {

    const result = await db.query(
        "SELECT * FROM deposits WHERE id = $1",
        [id]
    );

    return result.rows[0];
}


module.exports = {
    createDeposit,
    findDepositById
};