const express = require("express");
const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();


// ============================================
// GET LOGGED-IN USER WALLET
// ============================================

router.get("/", authenticateToken, async (req, res) => {

    try {

        const userId = req.user.id;

        const result = await db.query(
            `
            SELECT
                id,
                user_id,
                currency,
                balance,
                withdrawable_balance,
                locked_balance,
                created_at,
                updated_at
            FROM wallets
            WHERE user_id = $1
            `,
            [userId]
        );

        if (result.rows.length === 0) {

            return res.status(404).json({
                message: "Wallet not found."
            });

        }

        res.json({
            message: "Wallet retrieved successfully",
            wallet: result.rows[0]
        });

    } catch (error) {

        console.error("WALLET ERROR:", error);

        res.status(500).json({
            message: "Unable to retrieve wallet."
        });

    }

});


module.exports = router;
