const db = require("../config/db");


// ============================================
// CREATE USER
// ============================================

async function createUser(name, email, password) {

    const query = `
        INSERT INTO users
        (
            name,
            email,
            password
        )
        VALUES ($1, $2, $3)
        RETURNING
            id,
            name,
            email,
            trading_unlocked,
            unlock_fee_paid,
            unlock_paid_at;
    `;

    const values = [
        name,
        email,
        password
    ];

    const result = await db.query(query, values);

    return result.rows[0];
}


// ============================================
// FIND USER BY EMAIL
// ============================================

async function findUserByEmail(email) {

    const result = await db.query(
        `
        SELECT *
        FROM users
        WHERE email = $1
        `,
        [email]
    );

    return result.rows[0];
}


// ============================================
// FIND USER BY ID
// ============================================

async function findUserById(userId) {

    const result = await db.query(
        `
        SELECT
            id,
            name,
            email,
            trading_unlocked,
            unlock_fee_paid,
            unlock_paid_at
        FROM users
        WHERE id = $1
        `,
        [userId]
    );

    return result.rows[0];
}


// ============================================
// UNLOCK RESTRICTED ACCESS
// ============================================

async function unlockTradingAccess(userId) {

    const query = `
        UPDATE users
        SET
            trading_unlocked = TRUE,
            unlock_fee_paid = 250.00,
            unlock_paid_at = NOW()
        WHERE id = $1
        RETURNING
            id,
            name,
            email,
            trading_unlocked,
            unlock_fee_paid,
            unlock_paid_at;
    `;

    const result = await db.query(
        query,
        [userId]
    );

    return result.rows[0];
}


module.exports = {
    createUser,
    findUserByEmail,
    findUserById,
    unlockTradingAccess
};
