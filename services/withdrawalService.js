const db = require("../config/db");

/**
 * Withdrawal Processing Service
 *
 * Lifecycle:
 *
 * pending
 *    ↓
 * processing
 *    ↓
 * completed
 *
 * OR
 *
 * pending / processing
 *    ↓
 * failed
 *
 * When a withdrawal fails, locked funds are returned
 * to the user's withdrawable balance.
 *
 * IMPORTANT:
 * This service does NOT send money to a provider yet.
 * It handles SmartMinute's internal accounting safely.
 */


// ============================================
// START WITHDRAWAL PROCESSING
// ============================================

async function startWithdrawal(withdrawalId) {

    const client = await db.connect();

    try {

        await client.query("BEGIN");


        // ============================================
        // LOCK WITHDRAWAL
        // ============================================

        const withdrawalResult = await client.query(
            `
            SELECT
                id,
                user_id,
                amount,
                fee,
                net_amount,
                currency,
                method,
                destination,
                status,
                provider,
                provider_transaction_id
            FROM withdrawals
            WHERE id = $1
            FOR UPDATE
            `,
            [withdrawalId]
        );


        if (withdrawalResult.rows.length === 0) {

            throw new Error("Withdrawal not found.");

        }


        const withdrawal = withdrawalResult.rows[0];


        // ============================================
        // ONLY PENDING WITHDRAWALS CAN START
        // ============================================

        if (withdrawal.status !== "pending") {

            throw new Error(
                `Withdrawal cannot start because its status is '${withdrawal.status}'.`
            );

        }


        // ============================================
        // LOCK WALLET
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
            [withdrawal.user_id]
        );


        if (walletResult.rows.length === 0) {

            throw new Error("User wallet not found.");

        }


        const wallet = walletResult.rows[0];

        const amount = Number(withdrawal.amount);

        const lockedBalance =
            Number(wallet.locked_balance || 0);


        // ============================================
        // PROTECT AGAINST ACCOUNTING CORRUPTION
        // ============================================

        if (lockedBalance < amount) {

            throw new Error(
                "Withdrawal amount exceeds the wallet's locked balance."
            );

        }


        // ============================================
        // MARK PROCESSING
        // ============================================

        const result = await client.query(
            `
            UPDATE withdrawals
            SET
                status = 'processing',
                provider = COALESCE(provider, 'manual'),
                processed_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            AND status = 'pending'
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
                provider,
                processed_at,
                updated_at
            `,
            [withdrawal.id]
        );


        if (result.rows.length === 0) {

            throw new Error(
                "Withdrawal could not be moved to processing."
            );

        }


        await client.query("COMMIT");


        return {
            success: true,
            message: "Withdrawal moved to processing.",
            withdrawal: result.rows[0]
        };


    } catch (error) {

        await client.query("ROLLBACK");

        throw error;

    } finally {

        client.release();

    }

}


// ============================================
// COMPLETE WITHDRAWAL
// ============================================

async function completeWithdrawal(
    withdrawalId,
    providerTransactionId = null
) {

    const client = await db.connect();

    try {

        await client.query("BEGIN");


        // ============================================
        // LOCK WITHDRAWAL
        // ============================================

        const withdrawalResult = await client.query(
            `
            SELECT
                id,
                user_id,
                amount,
                fee,
                net_amount,
                currency,
                status,
                provider_transaction_id
            FROM withdrawals
            WHERE id = $1
            FOR UPDATE
            `,
            [withdrawalId]
        );


        if (withdrawalResult.rows.length === 0) {

            throw new Error("Withdrawal not found.");

        }


        const withdrawal = withdrawalResult.rows[0];


        // ============================================
        // IDEMPOTENCY PROTECTION
        // ============================================

        if (withdrawal.status === "completed") {

            await client.query("COMMIT");

            return {
                success: true,
                alreadyCompleted: true,
                message: "Withdrawal was already completed.",
                withdrawal
            };

        }


        if (withdrawal.status !== "processing") {

            throw new Error(
                `Only processing withdrawals can be completed. Current status: '${withdrawal.status}'.`
            );

        }


        // ============================================
        // LOCK WALLET
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
            [withdrawal.user_id]
        );


        if (walletResult.rows.length === 0) {

            throw new Error("User wallet not found.");

        }


        const wallet = walletResult.rows[0];

        const amount = Number(withdrawal.amount);

        const balance = Number(wallet.balance || 0);

        const lockedBalance =
            Number(wallet.locked_balance || 0);


        // ============================================
        // ACCOUNTING PROTECTION
        // ============================================

        if (lockedBalance < amount) {

            throw new Error(
                "Locked wallet balance is insufficient to complete withdrawal."
            );

        }


        if (balance < amount) {

            throw new Error(
                "Wallet balance is insufficient to complete withdrawal."
            );

        }


        // ============================================
        // FINALIZE WALLET
        //
        // The money has already been removed from
        // withdrawable_balance when the request was
        // created.
        //
        // Now permanently remove it from:
        // balance
        // locked_balance
        // ============================================

        const walletUpdate = await client.query(
            `
            UPDATE wallets
            SET
                balance = balance - $1,
                locked_balance = locked_balance - $1,
                updated_at = NOW()
            WHERE id = $2
            AND balance >= $1
            AND locked_balance >= $1
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
                wallet.id
            ]
        );


        if (walletUpdate.rows.length === 0) {

            throw new Error(
                "Wallet could not be finalized."
            );

        }


        // ============================================
        // COMPLETE WITHDRAWAL
        // ============================================

        const completedResult = await client.query(
            `
            UPDATE withdrawals
            SET
                status = 'completed',
                provider_transaction_id =
                    COALESCE($2, provider_transaction_id),
                completed_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            AND status = 'processing'
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
                provider,
                provider_transaction_id,
                processed_at,
                completed_at,
                updated_at
            `,
            [
                withdrawal.id,
                providerTransactionId
            ]
        );


        if (completedResult.rows.length === 0) {

            throw new Error(
                "Withdrawal could not be marked completed."
            );

        }


        await client.query("COMMIT");


        return {
            success: true,
            message: "Withdrawal completed successfully.",
            withdrawal: completedResult.rows[0],
            wallet: walletUpdate.rows[0]
        };


    } catch (error) {

        await client.query("ROLLBACK");

        throw error;

    } finally {

        client.release();

    }

}


// ============================================
// FAIL WITHDRAWAL
// ============================================

async function failWithdrawal(
    withdrawalId,
    failureReason = "Withdrawal failed."
) {

    const client = await db.connect();

    try {

        await client.query("BEGIN");


        // ============================================
        // LOCK WITHDRAWAL
        // ============================================

        const withdrawalResult = await client.query(
            `
            SELECT
                id,
                user_id,
                amount,
                fee,
                net_amount,
                currency,
                status
            FROM withdrawals
            WHERE id = $1
            FOR UPDATE
            `,
            [withdrawalId]
        );


        if (withdrawalResult.rows.length === 0) {

            throw new Error("Withdrawal not found.");

        }


        const withdrawal = withdrawalResult.rows[0];


        // ============================================
        // IDEMPOTENCY
        // ============================================

        if (
            withdrawal.status === "failed" ||
            withdrawal.status === "cancelled"
        ) {

            await client.query("COMMIT");

            return {
                success: true,
                alreadyFailed: true,
                message: "Withdrawal was already closed.",
                withdrawal
            };

        }


        if (
            withdrawal.status !== "pending" &&
            withdrawal.status !== "processing"
        ) {

            throw new Error(
                `Withdrawal cannot be failed from status '${withdrawal.status}'.`
            );

        }


        // ============================================
        // LOCK WALLET
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
            [withdrawal.user_id]
        );


        if (walletResult.rows.length === 0) {

            throw new Error("User wallet not found.");

        }


        const wallet = walletResult.rows[0];

        const amount = Number(withdrawal.amount);

        const lockedBalance =
            Number(wallet.locked_balance || 0);


        if (lockedBalance < amount) {

            throw new Error(
                "Locked wallet balance is insufficient to restore withdrawal funds."
            );

        }


        // ============================================
        // RETURN FUNDS TO USER
        // ============================================

        const walletUpdate = await client.query(
            `
            UPDATE wallets
            SET
                withdrawable_balance =
                    withdrawable_balance + $1,
                locked_balance =
                    locked_balance - $1,
                updated_at = NOW()
            WHERE id = $2
            AND locked_balance >= $1
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
                wallet.id
            ]
        );


        if (walletUpdate.rows.length === 0) {

            throw new Error(
                "Wallet could not be restored."
            );

        }


        // ============================================
        // MARK WITHDRAWAL FAILED
        // ============================================

        const failedResult = await client.query(
            `
            UPDATE withdrawals
            SET
                status = 'failed',
                failure_reason = $2,
                completed_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            AND status IN ('pending', 'processing')
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
                failure_reason,
                created_at,
                processed_at,
                completed_at,
                updated_at
            `,
            [
                withdrawal.id,
                failureReason
            ]
        );


        if (failedResult.rows.length === 0) {

            throw new Error(
                "Withdrawal could not be marked failed."
            );

        }


        await client.query("COMMIT");


        return {
            success: true,
            message:
                "Withdrawal failed and funds were returned to the wallet.",
            withdrawal: failedResult.rows[0],
            wallet: walletUpdate.rows[0]
        };


    } catch (error) {

        await client.query("ROLLBACK");

        throw error;

    } finally {

        client.release();

    }

}


module.exports = {
    startWithdrawal,
    completeWithdrawal,
    failWithdrawal
};
