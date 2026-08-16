const db = require("../config/db");

// ============================================
// SMARTMINUTE WITHDRAWAL SETTINGS
// ============================================

const MIN_WITHDRAWAL = 5000;

// Initial configurable fee.
// This can later be replaced by provider-specific
// fee calculation.
const WITHDRAWAL_FEE = 100;


// ============================================
// CREATE WITHDRAWAL
// ============================================

async function createWithdrawal(req, res) {

    const client = await db.connect();

    try {

        const userId = req.user.id;

        const {
            amount,
            method,
            destination
        } = req.body;


        // ============================================
        // VALIDATION
        // ============================================

        const withdrawalAmount = Number(amount);

        if (!Number.isFinite(withdrawalAmount)) {

            return res.status(400).json({
                message: "A valid withdrawal amount is required."
            });

        }


        if (withdrawalAmount < MIN_WITHDRAWAL) {

            return res.status(400).json({
                message:
                    `Minimum withdrawal amount is KSh ${MIN_WITHDRAWAL.toLocaleString()}.`
            });

        }


        if (!method) {

            return res.status(400).json({
                message: "Withdrawal method is required."
            });

        }


        if (!destination) {

            return res.status(400).json({
                message: "Withdrawal destination is required."
            });

        }


        // ============================================
        // START TRANSACTION
        // ============================================

        await client.query("BEGIN");


        // ============================================
        // LOCK USER WALLET
        // ============================================

        const walletResult = await client.query(
            `
            SELECT
                id,
                user_id,
                currency,
                balance,
                withdrawable_balance,
                locked_balance
            FROM wallets
            WHERE user_id = $1
            FOR UPDATE
            `,
            [userId]
        );


        if (walletResult.rows.length === 0) {

            await client.query("ROLLBACK");

            return res.status(404).json({
                message: "Wallet not found."
            });

        }


        const wallet = walletResult.rows[0];

        const withdrawableBalance =
            Number(wallet.withdrawable_balance || 0);


        // ============================================
        // CHECK BALANCE
        // ============================================

        if (withdrawableBalance < withdrawalAmount) {

            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "Insufficient withdrawable balance.",
                withdrawable_balance: withdrawableBalance,
                requested_amount: withdrawalAmount
            });

        }


        // ============================================
        // CALCULATE FEE
        // ============================================

        const fee = WITHDRAWAL_FEE;

        const netAmount =
            withdrawalAmount - fee;


        if (netAmount <= 0) {

            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "Withdrawal amount is too small after fees."
            });

        }


        // ============================================
        // MOVE MONEY INTO LOCKED BALANCE
        // ============================================

        const walletUpdate = await client.query(
            `
            UPDATE wallets
            SET
                withdrawable_balance =
                    withdrawable_balance - $1,
                locked_balance =
                    COALESCE(locked_balance, 0) + $1,
                updated_at = NOW()
            WHERE id = $2
            AND withdrawable_balance >= $1
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
                withdrawalAmount,
                wallet.id
            ]
        );


        if (walletUpdate.rows.length === 0) {

            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "Unable to reserve withdrawal funds."
            });

        }


        // ============================================
        // CREATE WITHDRAWAL REQUEST
        // ============================================

        const withdrawalResult = await client.query(
            `
            INSERT INTO withdrawals
            (
                user_id,
                amount,
                fee,
                net_amount,
                currency,
                method,
                destination,
                status
            )
            VALUES
            (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                'pending'
            )
            RETURNING
                id,
                user_id,
                amount,
                fee,
                net_amount,
                currency,
                method,
                destination,
                status,
                created_at
            `,
            [
                userId,
                withdrawalAmount,
                fee,
                netAmount,
                wallet.currency || "KES",
                method,
                destination
            ]
        );


        // ============================================
        // COMMIT
        // ============================================

        await client.query("COMMIT");


        return res.status(201).json({

            message:
                "Withdrawal request created successfully.",

            withdrawal:
                withdrawalResult.rows[0],

            wallet:
                walletUpdate.rows[0]

        });


    } catch (error) {

        try {
            await client.query("ROLLBACK");
        } catch (_) {}

        console.error(
            "WITHDRAWAL CREATE ERROR:",
            error
        );

        return res.status(500).json({
            message: "Unable to create withdrawal."
        });

    } finally {

        client.release();

    }

}


module.exports = {
    createWithdrawal
};
