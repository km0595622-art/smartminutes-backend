const express = require("express");

const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/adminMiddleware");
const depositModel = require("../models/depositModel");

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

        const client = await db.connect();

        try {

            const withdrawalId = req.params.id;

            const {
                provider,
                provider_transaction_id
            } = req.body;

            if (!provider_transaction_id) {

                return res.status(400).json({
                    message:
                        "Provider transaction ID is required."
                });

            }

            await client.query("BEGIN");

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

                await client.query("ROLLBACK");

                return res.status(404).json({
                    message: "Withdrawal not found."
                });

            }

            const withdrawal =
                withdrawalResult.rows[0];

            if (withdrawal.status !== "pending") {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    message:
                        `Withdrawal is already ${withdrawal.status}.`,
                    withdrawal
                });

            }

            const walletResult = await client.query(
                `
                SELECT
                    id,
                    user_id,
                    balance,
                    withdrawable_balance,
                    locked_balance,
                    currency
                FROM wallets
                WHERE user_id = $1
                FOR UPDATE
                `,
                [withdrawal.user_id]
            );

            if (walletResult.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(404).json({
                    message: "Wallet not found."
                });

            }

            const wallet = walletResult.rows[0];

            const amount = Number(withdrawal.amount);
            const lockedBalance =
                Number(wallet.locked_balance || 0);
            const balance =
                Number(wallet.balance || 0);

            if (
                !Number.isFinite(amount) ||
                amount <= 0
            ) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    message: "Invalid withdrawal amount."
                });

            }

            if (lockedBalance < amount) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    message:
                        "Locked wallet balance is insufficient for this withdrawal.",
                    locked_balance: lockedBalance,
                    withdrawal_amount: amount
                });

            }

            if (balance < amount) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    message:
                        "Wallet balance is insufficient for this withdrawal.",
                    balance,
                    withdrawal_amount: amount
                });

            }

            const updatedWallet = await client.query(
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

            if (updatedWallet.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    message:
                        "Unable to finalize withdrawal funds."
                });

            }

            const updatedWithdrawal =
                await client.query(
                    `
                    UPDATE withdrawals
                    SET
                        status = 'completed',
                        provider = COALESCE($2, provider),
                        provider_transaction_id = $3,
                        processed_at = NOW(),
                        completed_at = NOW(),
                        updated_at = NOW(),
                        failure_reason = NULL
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
                        provider_transaction_id,
                        processed_at,
                        completed_at,
                        updated_at
                    `,
                    [
                        withdrawalId,
                        provider || null,
                        provider_transaction_id
                    ]
                );

            if (updatedWithdrawal.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    message:
                        "Withdrawal could not be marked completed."
                });

            }

            await client.query("COMMIT");

            return res.json({
                message:
                    "Withdrawal approved successfully.",
                withdrawal:
                    updatedWithdrawal.rows[0],
                wallet:
                    updatedWallet.rows[0]
            });

        } catch (error) {

            try {
                await client.query("ROLLBACK");
            } catch (_) {}

            console.error(
                "ADMIN APPROVE WITHDRAWAL ERROR:",
                error
            );

            return res.status(500).json({
                message:
                    "Unable to approve withdrawal."
            });

        } finally {

            client.release();

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

        const client = await db.connect();

        try {

            const withdrawalId = req.params.id;

            const {
                failure_reason
            } = req.body;

            const reason =
                failure_reason ||
                "Withdrawal rejected by administrator.";

            await client.query("BEGIN");

            const withdrawalResult = await client.query(
                `
                SELECT
                    id,
                    user_id,
                    amount,
                    status
                FROM withdrawals
                WHERE id = $1
                FOR UPDATE
                `,
                [withdrawalId]
            );

            if (withdrawalResult.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(404).json({
                    message: "Withdrawal not found."
                });

            }

            const withdrawal =
                withdrawalResult.rows[0];

            if (withdrawal.status !== "pending") {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    message:
                        `Withdrawal is already ${withdrawal.status}.`,
                    withdrawal
                });

            }

            const amount = Number(withdrawal.amount);

            if (
                !Number.isFinite(amount) ||
                amount <= 0
            ) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    message: "Invalid withdrawal amount."
                });

            }

            const walletResult = await client.query(
                `
                UPDATE wallets
                SET
                    withdrawable_balance =
                        withdrawable_balance + $1,
                    locked_balance =
                        locked_balance - $1,
                    updated_at = NOW()
                WHERE user_id = $2
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
                    withdrawal.user_id
                ]
            );

            if (walletResult.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    message:
                        "Unable to release locked withdrawal funds."
                });

            }

            const updatedWithdrawal =
                await client.query(
                    `
                    UPDATE withdrawals
                    SET
                        status = 'failed',
                        failure_reason = $2,
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
                        failure_reason,
                        processed_at,
                        updated_at
                    `,
                    [
                        withdrawalId,
                        reason
                    ]
                );

            if (updatedWithdrawal.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    message:
                        "Withdrawal could not be rejected."
                });

            }

            await client.query("COMMIT");

            return res.json({
                message:
                    "Withdrawal rejected and funds returned.",
                withdrawal:
                    updatedWithdrawal.rows[0],
                wallet:
                    walletResult.rows[0]
            });

        } catch (error) {

            try {
                await client.query("ROLLBACK");
            } catch (_) {}

            console.error(
                "ADMIN REJECT WITHDRAWAL ERROR:",
                error
            );

            return res.status(500).json({
                message:
                    "Unable to reject withdrawal."
            });

        } finally {

            client.release();

        }

    }
);


module.exports = router;
