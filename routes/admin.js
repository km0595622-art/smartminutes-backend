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



// ============================================
// ADMIN — MEMBERSHIP PAYMENTS
// ============================================

router.get(
    "/membership/payments",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const result = await db.query(
                `
                SELECT
                    mp.id,
                    mp.user_id,
                    u.email,
                    mp.membership_tier,
                    mp.amount,
                    mp.phone,
                    mp.status,
                    mp.transaction_id,
                    mp.approved_at,
                    mp.created_at,
                    mp.updated_at
                FROM membership_payments mp
                LEFT JOIN users u
                    ON u.id = mp.user_id
                ORDER BY
                    CASE
                        WHEN mp.status = 'pending' THEN 0
                        ELSE 1
                    END,
                    mp.created_at DESC
                `
            );

            return res.status(200).json({
                success: true,
                payments: result.rows
            });

        } catch (error) {

            console.error(
                "ADMIN MEMBERSHIP PAYMENTS ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load membership payments."
            });

        }

    }
);


// ============================================
// ADMIN — APPROVE MEMBERSHIP PAYMENT
// ============================================

router.post(
    "/membership/payments/:id/approve",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        const client = await db.connect();

        try {

            const paymentId = Number(req.params.id);

            if (
                !Number.isInteger(paymentId) ||
                paymentId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message: "Invalid membership payment ID."
                });

            }

            const transactionId =
                req.body && req.body.transactionId
                    ? String(req.body.transactionId).trim()
                    : null;

            await client.query("BEGIN");

            const paymentResult = await client.query(
                `
                SELECT
                    id,
                    user_id,
                    membership_tier,
                    amount,
                    phone,
                    status,
                    transaction_id,
                    approved_at,
                    created_at
                FROM membership_payments
                WHERE id = $1
                FOR UPDATE
                `,
                [paymentId]
            );

            if (paymentResult.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(404).json({
                    success: false,
                    message:
                        "Membership payment not found."
                });

            }

            const payment = paymentResult.rows[0];

            if (payment.status !== "pending") {

                await client.query("ROLLBACK");

                return res.status(409).json({
                    success: false,
                    message:
                        "Membership payment is already " +
                        payment.status + ".",
                    payment: {
                        id: payment.id,
                        status: payment.status
                    }
                });

            }

            const userResult = await client.query(
                `
                SELECT
                    id,
                    email,
                    membership_tier,
                    membership_fee,
                    membership_activated_at
                FROM users
                WHERE id = $1
                FOR UPDATE
                `,
                [payment.user_id]
            );

            if (userResult.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(404).json({
                    success: false,
                    message:
                        "Membership payment user not found."
                });

            }

            const validTiers = [
                "bronze",
                "silver",
                "gold",
                "diamond",
                "titanium",
                "platinum"
            ];

            if (!validTiers.includes(payment.membership_tier)) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid membership tier on payment."
                });

            }

            if (transactionId) {

                const duplicateTransaction =
                    await client.query(
                        `
                        SELECT id
                        FROM membership_payments
                        WHERE transaction_id = $1
                          AND id <> $2
                        LIMIT 1
                        `,
                        [
                            transactionId,
                            payment.id
                        ]
                    );

                if (duplicateTransaction.rows.length > 0) {

                    await client.query("ROLLBACK");

                    return res.status(409).json({
                        success: false,
                        message:
                            "This transaction ID is already assigned to another membership payment."
                    });

                }

            }

            const activatedUser = await client.query(
                `
                UPDATE users
                SET
                    membership_tier = $1,
                    membership_fee = $2,
                    membership_activated_at = NOW()
                WHERE id = $3
                RETURNING
                    id,
                    email,
                    membership_tier,
                    membership_fee,
                    membership_activated_at
                `,
                [
                    payment.membership_tier,
                    payment.amount,
                    payment.user_id
                ]
            );

            if (activatedUser.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message:
                        "Unable to activate membership."
                });

            }

            const approvedPayment = await client.query(
                `
                UPDATE membership_payments
                SET
                    status = 'approved',
                    transaction_id =
                        COALESCE($1, transaction_id),
                    approved_at = NOW(),
                    updated_at = NOW()
                WHERE id = $2
                  AND status = 'pending'
                RETURNING
                    id,
                    user_id,
                    membership_tier,
                    amount,
                    phone,
                    status,
                    transaction_id,
                    approved_at,
                    created_at,
                    updated_at
                `,
                [
                    transactionId,
                    payment.id
                ]
            );

            if (approvedPayment.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(409).json({
                    success: false,
                    message:
                        "Membership payment could not be approved."
                });

            }

            await client.query("COMMIT");

            return res.status(200).json({
                success: true,
                message:
                    "Membership payment approved and membership activated successfully.",
                payment: approvedPayment.rows[0],
                user: activatedUser.rows[0]
            });

        } catch (error) {

            try {
                await client.query("ROLLBACK");
            } catch (_) {}

            console.error(
                "ADMIN APPROVE MEMBERSHIP ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to approve membership payment."
            });

        } finally {

            client.release();

        }

    }
);


// ============================================
// ADMIN — REJECT MEMBERSHIP PAYMENT
// ============================================

router.post(
    "/membership/payments/:id/reject",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const paymentId = Number(req.params.id);

            if (
                !Number.isInteger(paymentId) ||
                paymentId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid membership payment ID."
                });

            }

            const result = await db.query(
                `
                UPDATE membership_payments
                SET
                    status = 'rejected',
                    updated_at = NOW()
                WHERE id = $1
                  AND status = 'pending'
                RETURNING
                    id,
                    user_id,
                    membership_tier,
                    amount,
                    phone,
                    status,
                    transaction_id,
                    approved_at,
                    created_at,
                    updated_at
                `,
                [paymentId]
            );

            if (result.rows.length === 0) {

                const existing = await db.query(
                    `
                    SELECT
                        id,
                        status
                    FROM membership_payments
                    WHERE id = $1
                    `,
                    [paymentId]
                );

                if (existing.rows.length === 0) {

                    return res.status(404).json({
                        success: false,
                        message:
                            "Membership payment not found."
                    });

                }

                return res.status(409).json({
                    success: false,
                    message:
                        "Membership payment is already " +
                        existing.rows[0].status + ".",
                    payment: existing.rows[0]
                });

            }

            return res.status(200).json({
                success: true,
                message:
                    "Membership payment rejected successfully.",
                payment: result.rows[0]
            });

        } catch (error) {

            console.error(
                "ADMIN REJECT MEMBERSHIP ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to reject membership payment."
            });

        }

    }
);


// ============================================
// ADMIN — TRADING UNLOCK PAYMENTS
// ============================================

router.get(
    "/unlock/payments",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const result = await db.query(
                `
                SELECT
                    up.id,
                    up.user_id,
                    u.email,
                    up.amount,
                    up.payment_method,
                    up.transaction_reference,
                    up.status,
                    up.created_at,
                    u.trading_unlocked,
                    u.unlock_fee_paid,
                    u.unlock_paid_at
                FROM unlock_payments up
                LEFT JOIN users u
                    ON u.id = up.user_id
                ORDER BY
                    CASE
                        WHEN up.status = 'pending' THEN 0
                        ELSE 1
                    END,
                    up.created_at DESC
                `
            );

            return res.status(200).json({
                success: true,
                payments: result.rows
            });

        } catch (error) {

            console.error(
                "ADMIN UNLOCK PAYMENTS ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load trading unlock payments."
            });

        }

    }
);


// ============================================
// ADMIN — APPROVE TRADING UNLOCK PAYMENT
// ============================================

router.post(
    "/unlock/payments/:id/approve",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        const client = await db.connect();

        try {

            const paymentId = Number(req.params.id);

            if (
                !Number.isInteger(paymentId) ||
                paymentId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid unlock payment ID."
                });

            }

            const transactionReference =
                req.body && req.body.transactionReference
                    ? String(req.body.transactionReference).trim()
                    : null;

            await client.query("BEGIN");

            const paymentResult = await client.query(
                `
                SELECT
                    id,
                    user_id,
                    amount,
                    payment_method,
                    transaction_reference,
                    status,
                    created_at,
                    completed_at
                FROM unlock_payments
                WHERE id = $1
                FOR UPDATE
                `,
                [paymentId]
            );

            if (paymentResult.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(404).json({
                    success: false,
                    message:
                        "Unlock payment not found."
                });

            }

            const payment = paymentResult.rows[0];

            if (payment.status !== "pending") {

                await client.query("ROLLBACK");

                return res.status(409).json({
                    success: false,
                    message:
                        "Unlock payment is already " +
                        payment.status + ".",
                    payment: {
                        id: payment.id,
                        status: payment.status
                    }
                });

            }

            if (Number(payment.amount) !== 10 || payment.currency !== "USD") {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid trading unlock payment amount."
                });

            }

            if (transactionReference) {

                const duplicateTransaction =
                    await client.query(
                        `
                        SELECT id
                        FROM unlock_payments
                        WHERE transaction_reference = $1
                          AND id <> $2
                        LIMIT 1
                        `,
                        [
                            transactionReference,
                            payment.id
                        ]
                    );

                if (duplicateTransaction.rows.length > 0) {

                    await client.query("ROLLBACK");

                    return res.status(409).json({
                        success: false,
                        message:
                            "This transaction reference is already assigned to another unlock payment."
                    });

                }

            }

            const userResult = await client.query(
                `
                SELECT
                    id,
                    email,
                    trading_unlocked,
                    unlock_fee_paid,
                    unlock_paid_at
                FROM users
                WHERE id = $1
                FOR UPDATE
                `,
                [payment.user_id]
            );

            if (userResult.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(404).json({
                    success: false,
                    message:
                        "Unlock payment user not found."
                });

            }

            const user = userResult.rows[0];

            if (user.trading_unlocked === true) {

                await client.query(
                    `
                    UPDATE unlock_payments
                    SET
                        status = 'successful',
                        transaction_reference =
                            COALESCE($1, transaction_reference),
                        completed_at = NOW()
                    WHERE id = $2
                    `,
                    [
                        transactionReference,
                        payment.id
                    ]
                );

                await client.query("COMMIT");

                return res.status(200).json({
                    success: true,
                    message:
                        "User was already unlocked. Payment marked successful.",
                    tradingUnlocked: true,
                    paymentId: payment.id
                });

            }

            const activatedUser = await client.query(
                `
                UPDATE users
                SET
                    trading_unlocked = TRUE,
                    unlock_fee_paid = 10.00,
                    unlock_paid_at = NOW()
                WHERE id = $1
                RETURNING
                    id,
                    email,
                    trading_unlocked,
                    unlock_fee_paid,
                    unlock_paid_at
                `,
                [payment.user_id]
            );

            if (activatedUser.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    message:
                        "Unable to unlock trading access."
                });

            }

            const approvedPayment = await client.query(
                `
                UPDATE unlock_payments
                SET
                    status = 'successful',
                    transaction_reference =
                        COALESCE($1, transaction_reference),
                    completed_at = NOW()
                WHERE id = $2
                  AND status = 'pending'
                RETURNING
                    id,
                    user_id,
                    amount,
                    payment_method,
                    transaction_reference,
                    status,
                    created_at,
                    completed_at
                `,
                [
                    transactionReference,
                    payment.id
                ]
            );

            if (approvedPayment.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(409).json({
                    success: false,
                    message:
                        "Unlock payment could not be approved."
                });

            }

            await client.query("COMMIT");

            return res.status(200).json({
                success: true,
                message:
                    "Trading unlock payment approved and trading access activated successfully.",
                payment: approvedPayment.rows[0],
                user: activatedUser.rows[0]
            });

        } catch (error) {

            try {
                await client.query("ROLLBACK");
            } catch (_) {}

            console.error(
                "ADMIN APPROVE UNLOCK ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to approve trading unlock payment."
            });

        } finally {

            client.release();

        }

    }
);


// ============================================
// ADMIN — REJECT TRADING UNLOCK PAYMENT
// ============================================

router.post(
    "/unlock/payments/:id/reject",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const paymentId = Number(req.params.id);

            if (
                !Number.isInteger(paymentId) ||
                paymentId <= 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid unlock payment ID."
                });

            }

            const result = await db.query(
                `
                UPDATE unlock_payments
                SET
                    status = 'failed'
                WHERE id = $1
                  AND status = 'pending'
                RETURNING
                    id,
                    user_id,
                    amount,
                    payment_method,
                    transaction_reference,
                    status,
                    created_at,
                    completed_at
                `,
                [paymentId]
            );

            if (result.rows.length === 0) {

                const existing = await db.query(
                    `
                    SELECT
                        id,
                        status
                    FROM unlock_payments
                    WHERE id = $1
                    `,
                    [paymentId]
                );

                if (existing.rows.length === 0) {

                    return res.status(404).json({
                        success: false,
                        message:
                            "Unlock payment not found."
                    });

                }

                return res.status(409).json({
                    success: false,
                    message:
                        "Unlock payment is already " +
                        existing.rows[0].status + ".",
                    payment: existing.rows[0]
                });

            }

            return res.status(200).json({
                success: true,
                message:
                    "Trading unlock payment rejected successfully.",
                payment: result.rows[0]
            });

        } catch (error) {

            console.error(
                "ADMIN REJECT UNLOCK ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to reject trading unlock payment."
            });

        }

    }
);

module.exports = router;
