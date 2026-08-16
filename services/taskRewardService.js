const db = require("../config/db");

/**
 * Verify a submitted task attempt and credit its reward.
 *
 * IMPORTANT:
 * This function is intended for trusted backend/admin/provider
 * verification only. Do NOT expose it directly to normal users.
 */
async function verifyTaskAttempt(attemptId) {

    const client = await db.connect();

    try {

        await client.query("BEGIN");

        // ============================================
        // 1. LOCK AND LOAD THE TASK ATTEMPT
        // ============================================

        const attemptResult = await client.query(
            `
            SELECT
                ta.id,
                ta.user_id,
                ta.task_id,
                ta.status,
                t.title,
                t.reward,
                t.is_active
            FROM task_attempts ta
            JOIN tasks t
                ON t.id = ta.task_id
            WHERE ta.id = $1
            FOR UPDATE OF ta
            `,
            [attemptId]
        );

        if (attemptResult.rows.length === 0) {
            throw new Error("Task attempt not found.");
        }

        const attempt = attemptResult.rows[0];

        // ============================================
        // 2. ONLY SUBMITTED TASKS CAN BE VERIFIED
        // ============================================

        if (attempt.status !== "submitted") {
            throw new Error(
                `Task attempt cannot be verified because its status is '${attempt.status}'.`
            );
        }

        if (!attempt.is_active) {
            throw new Error("The task is no longer active.");
        }

        // ============================================
        // 3. CHECK WHETHER THIS ATTEMPT ALREADY
        //    HAS AN EARNING
        // ============================================

        const existingEarning = await client.query(
            `
            SELECT
                id,
                amount,
                status
            FROM earnings
            WHERE task_attempt_id = $1
            LIMIT 1
            `,
            [attempt.id]
        );

        if (existingEarning.rows.length > 0) {
            throw new Error(
                "This task attempt already has an earning."
            );
        }

        // ============================================
        // 4. LOCK THE USER WALLET
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
            [attempt.user_id]
        );

        if (walletResult.rows.length === 0) {
            throw new Error("User wallet not found.");
        }

        const wallet = walletResult.rows[0];

        // ============================================
        // 5. VERIFY REWARD AMOUNT
        // ============================================

        const reward = Number(attempt.reward);

        if (!Number.isFinite(reward) || reward <= 0) {
            throw new Error("Invalid task reward.");
        }

        // ============================================
        // 6. MARK ATTEMPT AS VERIFIED
        // ============================================

        const verifiedResult = await client.query(
            `
            UPDATE task_attempts
            SET
                status = 'verified',
                verified_at = NOW()
            WHERE id = $1
            AND status = 'submitted'
            RETURNING
                id,
                user_id,
                task_id,
                status,
                started_at,
                completed_at,
                verified_at
            `,
            [attempt.id]
        );

        if (verifiedResult.rows.length === 0) {
            throw new Error(
                "Task attempt could not be verified."
            );
        }

        // ============================================
        // 7. CREATE APPROVED EARNING
        // ============================================

        const earningResult = await client.query(
            `
            INSERT INTO earnings
            (
                user_id,
                task_id,
                task_attempt_id,
                amount,
                description,
                status,
                approved_at
            )
            VALUES
            (
                $1,
                $2,
                $3,
                $4,
                $5,
                'approved',
                NOW()
            )
            RETURNING
                id,
                user_id,
                task_id,
                task_attempt_id,
                amount,
                description,
                status,
                created_at,
                approved_at
            `,
            [
                attempt.user_id,
                attempt.task_id,
                attempt.id,
                reward,
                `Reward for completing task: ${attempt.title}`
            ]
        );

        // ============================================
        // 8. CREDIT WALLET
        // ============================================

        const walletUpdate = await client.query(
            `
            UPDATE wallets
            SET
                balance = COALESCE(balance, 0) + $1,
                withdrawable_balance =
                    COALESCE(withdrawable_balance, 0) + $1,
                updated_at = NOW()
            WHERE id = $2
            RETURNING
                id,
                user_id,
                currency,
                balance,
                withdrawable_balance,
                locked_balance,
                updated_at
            `,
            [reward, wallet.id]
        );

        if (walletUpdate.rows.length === 0) {
            throw new Error("Wallet could not be updated.");
        }

        // ============================================
        // 9. COMMIT EVERYTHING
        // ============================================

        await client.query("COMMIT");

        return {
            success: true,
            message: "Task verified and reward credited successfully.",
            attempt: verifiedResult.rows[0],
            earning: earningResult.rows[0],
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
    verifyTaskAttempt
};
