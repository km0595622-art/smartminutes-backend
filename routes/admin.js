const express = require("express");

const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/adminMiddleware");
const depositModel = require("../models/depositModel");
const { failWithdrawal } = require("../services/withdrawalService");
const { processWithdrawal } = require("../services/withdrawalProcessor");

const router = express.Router();


// ============================================
// ADMIN — DASHBOARD SUMMARY
// ============================================

router.get(
    "/dashboard",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const result = await db.query(`
                SELECT
                    (SELECT COUNT(*) FROM users) AS total_users,

                    (
                        SELECT COUNT(*)
                        FROM users
                        WHERE role = 'admin'
                    ) AS total_admins,

                    (
                        SELECT COUNT(*)
                        FROM deposits
                    ) AS total_deposits,

                    (
                        SELECT COUNT(*)
                        FROM deposits
                        WHERE status = 'pending'
                    ) AS pending_deposits,

                    (
                        SELECT COALESCE(SUM(amount), 0)
                        FROM deposits
                        WHERE status = 'completed'
                    ) AS completed_deposit_amount,

                    (
                        SELECT COUNT(*)
                        FROM withdrawals
                        WHERE status = 'pending'
                    ) AS pending_withdrawals,

                    (
                        SELECT COALESCE(SUM(amount), 0)
                        FROM withdrawals
                        WHERE status = 'completed'
                    ) AS completed_withdrawal_amount,

                    (
                        SELECT COALESCE(SUM(balance), 0)
                        FROM wallets
                    ) AS total_wallet_balance,

                    (
                        SELECT COALESCE(SUM(withdrawable_balance), 0)
                        FROM wallets
                    ) AS total_withdrawable_balance,

                    (
                        SELECT COUNT(*)
                        FROM task_attempts
                        WHERE status = 'submitted'
                    ) AS submitted_tasks,

                    (
                        SELECT COUNT(*)
                        FROM earnings
                        WHERE status = 'pending'
                    ) AS pending_earnings,

                    (
                        SELECT COALESCE(SUM(amount), 0)
                        FROM earnings
                        WHERE status = 'approved'
                    ) AS approved_earnings
            `);

            const dashboard = result.rows[0];

            return res.json({
                message: "Admin dashboard loaded successfully.",
                dashboard
            });

        } catch (error) {

            console.error(
                "ADMIN DASHBOARD ERROR:",
                error
            );

            return res.status(500).json({
                message: "Unable to load admin dashboard."
            });

        }

    }
);


// ============================================
// ADMIN — GET DEPOSITS
// ============================================

router.get(
    "/deposits",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const result = await db.query(`
                SELECT
                    d.id,
                    d.user_id,
                    u.name AS user_name,
                    u.email AS user_email,
                    d.amount,
                    d.phone,
                    d.status,
                    d.transaction_id,
                    d.created_at
                FROM deposits d
                LEFT JOIN users u
                    ON u.id = d.user_id
                ORDER BY d.created_at DESC
            `);

            return res.json({
                message: "Deposits retrieved successfully.",
                deposits: result.rows
            });

        } catch (error) {

            console.error(
                "ADMIN GET DEPOSITS ERROR:",
                error
            );

            return res.status(500).json({
                message: "Unable to retrieve deposits."
            });

        }

    }
);




// ============================================
// ADMIN — APPROVE DEPOSIT
// ============================================

router.post(
    "/deposits/:id/approve",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const depositId = Number(req.params.id);

            const {
                transaction_id
            } = req.body;

            // --------------------------------------------
            // VALIDATE DEPOSIT ID
            // --------------------------------------------

            if (!Number.isInteger(depositId) || depositId <= 0) {

                return res.status(400).json({
                    message: "Invalid deposit ID."
                });
            }

            // --------------------------------------------
            // VALIDATE TRANSACTION ID
            // --------------------------------------------

            if (
                !transaction_id ||
                typeof transaction_id !== "string" ||
                !transaction_id.trim()
            ) {

                return res.status(400).json({
                    message: "Transaction ID is required."
                });
            }

            const providerTransactionId =
                transaction_id.trim();

            // --------------------------------------------
            // CONFIRM PAYMENT
            // --------------------------------------------

            const result =
                await depositModel.confirmDeposit(
                    depositId,
                    providerTransactionId
                );

            // --------------------------------------------
            // ALREADY PROCESSED
            // --------------------------------------------

            if (result.alreadyProcessed) {

                return res.status(200).json({
                    message: "Deposit was already processed.",
                    alreadyProcessed: true,
                    deposit: result.deposit
                });
            }

            // --------------------------------------------
            // SUCCESS
            // --------------------------------------------

            return res.status(200).json({
                message: "Deposit approved and wallet credited.",
                alreadyProcessed: false,
                deposit: result.deposit,
                wallet: result.wallet
            });

        } catch (error) {

            console.error(
                "ADMIN APPROVE DEPOSIT ERROR:",
                error
            );

            // Duplicate transaction ID
            if (error.code === "23505") {

                return res.status(409).json({
                    message:
                        "This transaction ID has already been used."
                });
            }

            return res.status(500).json({
                message: "Unable to approve deposit."
            });

        }

    }
);


// ============================================
// ADMIN — GET USERS
// ============================================

router.get(
    "/users",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const result = await db.query(`
                SELECT
                    id,
                    name,
                    email,
                    role,
                    trading_unlocked,
                    unlock_fee_paid,
                    unlock_paid_at,
                    created_at
                FROM users
                ORDER BY created_at DESC
            `);

            return res.json({
                message: "Users retrieved successfully.",
                users: result.rows
            });

        } catch (error) {

            console.error(
                "ADMIN GET USERS ERROR:",
                error
            );

            return res.status(500).json({
                message: "Unable to retrieve users."
            });

        }

    }
);


// ============================================
// ADMIN — GET WITHDRAWALS
// ============================================

router.get(
    "/withdrawals",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const result = await db.query(`
                SELECT
                    w.id,
                    w.user_id,
                    u.name AS user_name,
                    u.email AS user_email,
                    w.amount,
                    w.fee,
                    w.net_amount,
                    w.currency,
                    w.method,
                    w.destination,
                    w.status,
                    w.provider,
                    w.provider_transaction_id,
                    w.failure_reason,
                    w.created_at,
                    w.processed_at,
                    w.completed_at,
                    w.updated_at
                FROM withdrawals w
                LEFT JOIN users u
                    ON u.id = w.user_id
                ORDER BY w.created_at DESC
            `);

            return res.json({
                message: "Withdrawals retrieved successfully.",
                withdrawals: result.rows
            });

        } catch (error) {

            console.error(
                "ADMIN GET WITHDRAWALS ERROR:",
                error
            );

            return res.status(500).json({
                message: "Unable to retrieve withdrawals."
            });

        }

    }
);


// ============================================
// ADMIN — APPROVE WITHDRAWAL
// ============================================

router.post(
    "/withdrawals/:id/approve",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        const withdrawalId = req.params.id;

        const provider =
            req.body?.provider || "manual";

        try {

            const result = await processWithdrawal(
                withdrawalId,
                provider
            );

            return res.json(result);

        } catch (error) {

            console.error(
                "ADMIN APPROVE WITHDRAWAL ERROR:",
                error
            );

            const message = error.message || "";

            if (
                message === "Withdrawal not found."
            ) {
                return res.status(404).json({
                    message
                });
            }

            if (
                message.includes("already") ||
                message.includes("cannot") ||
                message.includes("required") ||
                message.includes("Invalid") ||
                message.includes("insufficient") ||
                message.includes("Unsupported") ||
                message.includes("not connected")
            ) {
                return res.status(400).json({
                    message
                });
            }

            return res.status(500).json({
                message:
                    "Unable to process withdrawal."
            });

        }

    }
);


// ============================================

// ADMIN — REJECT WITHDRAWAL
// ============================================

router.post(
    "/withdrawals/:id/reject",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        const withdrawalId = req.params.id;

        const {
            failure_reason
        } = req.body;

        const reason =
            failure_reason ||
            "Withdrawal rejected by administrator.";

        try {

            const result = await failWithdrawal(
                withdrawalId,
                reason
            );

            return res.json({
                message:
                    "Withdrawal rejected and funds returned.",
                withdrawal:
                    result.withdrawal,
                wallet:
                    result.wallet
            });

        } catch (error) {

            console.error(
                "ADMIN REJECT WITHDRAWAL ERROR:",
                error
            );

            const message = error.message || "";

            if (
                message === "Withdrawal not found."
            ) {
                return res.status(404).json({
                    message
                });
            }

            if (
                message.includes("already") ||
                message.includes("Invalid") ||
                message.includes("insufficient") ||
                message.includes("cannot be failed")
            ) {
                return res.status(400).json({
                    message
                });
            }

            return res.status(500).json({
                message:
                    "Unable to reject withdrawal."
            });

        }

    }
);

// ============================================
// ADMIN — APPROVE TASK ATTEMPT
// ============================================

router.post(
    "/tasks/attempts/:id/approve",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        const client = await db.connect();

        try {

            const attemptId = Number(req.params.id);

            if (!Number.isInteger(attemptId) || attemptId <= 0) {

                return res.status(400).json({
                    message: "Invalid task attempt ID."
                });

            }

            await client.query("BEGIN");

            // --------------------------------------------
            // LOCK SUBMITTED ATTEMPT
            // --------------------------------------------

            const attemptResult = await client.query(
                `
                SELECT
                    ta.id,
                    ta.user_id,
                    ta.task_id,
                    ta.status,
                    t.title,
                    t.reward
                FROM task_attempts ta
                INNER JOIN tasks t
                    ON t.id = ta.task_id
                WHERE ta.id = $1
                FOR UPDATE OF ta
                `,
                [attemptId]
            );

            if (attemptResult.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(404).json({
                    message: "Task attempt not found."
                });

            }

            const attempt = attemptResult.rows[0];

            // --------------------------------------------
            // PREVENT DOUBLE APPROVAL
            // --------------------------------------------

            if (attempt.status !== "submitted") {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    message:
                        `Task attempt is already ${attempt.status}.`,
                    attempt
                });

            }

            const reward = Number(attempt.reward);

            if (!Number.isFinite(reward) || reward <= 0) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    message: "Invalid task reward."
                });

            }

            // --------------------------------------------
            // LOCK USER WALLET
            // --------------------------------------------

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

                await client.query("ROLLBACK");

                return res.status(404).json({
                    message: "Wallet not found."
                });

            }

            const wallet = walletResult.rows[0];

            // --------------------------------------------
            // CREATE APPROVED EARNING
            // --------------------------------------------

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

            // --------------------------------------------
            // CREDIT WALLET
            // --------------------------------------------

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
                [
                    reward,
                    wallet.id
                ]
            );

            if (walletUpdate.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    message: "Unable to credit wallet."
                });

            }

            // --------------------------------------------
            // MARK ATTEMPT APPROVED
            // --------------------------------------------

            const updatedAttempt = await client.query(
                `
                UPDATE task_attempts
                SET
                    status = 'approved',
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
                [attemptId]
            );

            if (updatedAttempt.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    message:
                        "Task attempt could not be approved."
                });

            }

            await client.query("COMMIT");

            return res.status(200).json({
                message:
                    "Task approved and reward credited successfully.",
                attempt: updatedAttempt.rows[0],
                earning: earningResult.rows[0],
                wallet: walletUpdate.rows[0]
            });

        } catch (error) {

            try {
                await client.query("ROLLBACK");
            } catch (_) {}

            console.error(
                "ADMIN APPROVE TASK ERROR:",
                error
            );

            return res.status(500).json({
                message:
                    "Unable to approve task attempt."
            });

        } finally {

            client.release();

        }

    }
);


module.exports = router;
