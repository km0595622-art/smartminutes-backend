const db = require("../config/db");


async function createDeposit(userId, amount, phone) {

    const query = `
        INSERT INTO deposits
        (user_id, amount, phone, status)
        VALUES ($1, $2, $3, 'pending')
        RETURNING
            id,
            user_id,
            amount,
            phone,
            status,
            transaction_id,
            created_at;
    `;

    const result = await db.query(query, [
        userId,
        amount,
        phone
    ]);

    return result.rows[0];
}


async function findDepositById(id, userId) {

    const result = await db.query(
        `
        SELECT
            id,
            user_id,
            amount,
            phone,
            status,
            transaction_id,
            created_at
        FROM deposits
        WHERE id = $1
          AND user_id = $2
        `,
        [id, userId]
    );

    return result.rows[0];
}


/*
============================================
CONFIRM DEPOSIT
============================================

This function is intended to be called ONLY
after a real payment provider confirms that
the money was received.

It is deliberately designed to be idempotent:
a confirmed deposit cannot be credited twice.
*/

async function confirmDeposit(
    depositId,
    providerTransactionId
) {

    const client = await db.connect();

    try {

        await client.query("BEGIN");


        // Lock the deposit row so two confirmations
        // cannot process it simultaneously.

        const depositResult = await client.query(
            `
            SELECT
                id,
                user_id,
                amount,
                status,
                transaction_id
            FROM deposits
            WHERE id = $1
            FOR UPDATE
            `,
            [depositId]
        );


        if (depositResult.rows.length === 0) {

            throw new Error("Deposit not found.");
        }


        const deposit = depositResult.rows[0];


        // Already completed = do nothing.
        // This prevents double wallet crediting.

        if (deposit.status === "completed") {

            await client.query("COMMIT");

            return {
                alreadyProcessed: true,
                deposit
            };
        }


        const amount = Number(deposit.amount);


        if (!Number.isFinite(amount) || amount <= 0) {

            throw new Error(
                "Invalid deposit amount."
            );
        }


        /*
        ========================================
        UPDATE DEPOSIT
        ========================================
        */

        const updatedDeposit =
            await client.query(
                `
                UPDATE deposits
                SET
                    status = 'completed',
                    transaction_id = $2
                WHERE id = $1
                RETURNING
                    id,
                    user_id,
                    amount,
                    status,
                    transaction_id,
                    created_at
                `,
                [
                    depositId,
                    providerTransactionId
                ]
            );


        /*
        ========================================
        CREDIT WALLET
        ========================================
        */

        const walletResult =
            await client.query(
                `
                UPDATE wallets
                SET
                    balance = balance + $1,
                    updated_at = NOW()
                WHERE user_id = $2
                RETURNING
                    id,
                    user_id,
                    currency,
                    balance,
                    withdrawable_balance,
                    locked_balance,
                    updated_at
                `,
                [
                    amount,
                    deposit.user_id
                ]
            );


        if (walletResult.rows.length === 0) {

            throw new Error(
                "Wallet not found for this user."
            );
        }


        await client.query("COMMIT");


        return {
            alreadyProcessed: false,
            deposit: updatedDeposit.rows[0],
            wallet: walletResult.rows[0]
        };


    } catch (error) {

        await client.query("ROLLBACK");

        throw error;

    } finally {

        client.release();
    }
}


module.exports = {
    createDeposit,
    findDepositById,
    confirmDeposit
};
