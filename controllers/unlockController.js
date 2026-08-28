const db = require("../config/db");

const UNLOCK_FEE = 250.00;


// ============================================
// CREATE TRADING UNLOCK PAYMENT
// ============================================

async function createUnlockPayment(req, res) {

    try {

        const userId = req.user.id;

        const {
            phone,
            paymentMethod,
            transactionReference
        } = req.body || {};

        // --------------------------------------------
        // CHECK USER
        // --------------------------------------------

        const userResult = await db.query(
            `
            SELECT
                id,
                trading_unlocked
            FROM users
            WHERE id = $1
            `,
            [userId]
        );

        if (userResult.rows.length === 0) {

            return res.status(404).json({
                success: false,
                message: "User not found."
            });

        }

        const user = userResult.rows[0];

        // --------------------------------------------
        // ALREADY UNLOCKED
        // --------------------------------------------

        if (user.trading_unlocked === true) {

            return res.status(409).json({
                success: false,
                message: "Trading access is already unlocked.",
                tradingUnlocked: true
            });

        }

        // --------------------------------------------
        // VALIDATE PHONE
        // --------------------------------------------

        if (
            !phone ||
            typeof phone !== "string" ||
            !phone.trim()
        ) {

            return res.status(400).json({
                success: false,
                message: "Phone number is required."
            });

        }

        const cleanPhone = phone.trim();

        // --------------------------------------------
        // VALIDATE PAYMENT METHOD
        // --------------------------------------------

        const cleanPaymentMethod =
            paymentMethod &&
            typeof paymentMethod === "string"
                ? paymentMethod.trim()
                : "mpesa";

        // --------------------------------------------
        // CHECK EXISTING PENDING PAYMENT
        // --------------------------------------------

        const pendingResult = await db.query(
            `
            SELECT
                id,
                user_id,
                amount,
                payment_method,
                transaction_reference,
                status,
                created_at
            FROM unlock_payments
            WHERE user_id = $1
              AND status = 'pending'
            ORDER BY created_at DESC
            LIMIT 1
            `,
            [userId]
        );

        if (pendingResult.rows.length > 0) {

            return res.status(409).json({
                success: false,
                message:
                    "You already have a pending trading unlock payment.",
                payment: pendingResult.rows[0]
            });

        }

        // --------------------------------------------
        // CREATE PAYMENT
        // --------------------------------------------

        const result = await db.query(
            `
            INSERT INTO unlock_payments
            (
                user_id,
                amount,
                payment_method,
                transaction_reference,
                status
            )
            VALUES
            ($1, $2, $3, $4, 'pending')
            RETURNING
                id,
                user_id,
                amount,
                payment_method,
                transaction_reference,
                status,
                created_at
            `,
            [
                userId,
                UNLOCK_FEE,
                cleanPaymentMethod,
                transactionReference
                    ? String(transactionReference).trim()
                    : null
            ]
        );

        return res.status(201).json({
            success: true,
            message:
                "Trading unlock payment request created successfully.",
            payment: result.rows[0]
        });

    } catch (error) {

        console.error(
            "CREATE UNLOCK PAYMENT ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to create trading unlock payment."
        });

    }
}


// ============================================
// GET CURRENT TRADING UNLOCK STATUS
// ============================================

async function getUnlockStatus(req, res) {

    try {

        const userId = req.user.id;

        const result = await db.query(
            `
            SELECT
                id,
                trading_unlocked,
                unlock_fee_paid,
                unlock_paid_at
            FROM users
            WHERE id = $1
            `,
            [userId]
        );

        if (result.rows.length === 0) {

            return res.status(404).json({
                success: false,
                message: "User not found."
            });

        }

        const user = result.rows[0];

        return res.json({
            success: true,
            tradingUnlocked: user.trading_unlocked,
            unlockFee: UNLOCK_FEE,
            feePaid: user.unlock_fee_paid,
            unlockedAt: user.unlock_paid_at
        });

    } catch (error) {

        console.error(
            "GET UNLOCK STATUS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to load trading unlock status."
        });

    }
}


module.exports = {
    createUnlockPayment,
    getUnlockStatus
};
