const db = require("../config/db");
const {
    MEMBERSHIP_TIERS,
    getMembershipTier
} = require("../config/membership");


// ============================================
// CREATE MEMBERSHIP PAYMENT
// ============================================

async function createMembershipPayment(req, res) {

    try {

        const userId = req.user.id;

        const {
            membershipTier,
            phone
        } = req.body;

        // --------------------------------------------
        // VALIDATE TIER
        // --------------------------------------------

        if (
            !membershipTier ||
            typeof membershipTier !== "string"
        ) {
            return res.status(400).json({
                success: false,
                message: "Membership tier is required."
            });
        }

        const tierKey = membershipTier.trim().toLowerCase();

        const tier = MEMBERSHIP_TIERS[tierKey];

        if (!tier || tierKey === "free") {
            return res.status(400).json({
                success: false,
                message:
                    "Please select a valid paid membership tier."
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
        // CHECK CURRENT MEMBERSHIP
        // --------------------------------------------

        const userResult = await db.query(
            `
            SELECT
                id,
                membership_tier
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

        const currentTier =
            userResult.rows[0].membership_tier || "free";

        const currentRank =
            getMembershipTier(currentTier).rank;

        const requestedRank = tier.rank;

        if (requestedRank <= currentRank) {
            return res.status(400).json({
                success: false,
                message:
                    "You already have this membership or a higher membership.",
                currentMembership: currentTier,
                requestedMembership: tierKey
            });
        }

        // --------------------------------------------
        // PREVENT DUPLICATE PENDING PURCHASE
        // --------------------------------------------

        const pendingResult = await db.query(
            `
            SELECT
                id,
                membership_tier,
                amount,
                phone,
                status,
                created_at
            FROM membership_payments
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
                    "You already have a pending membership payment.",
                payment: pendingResult.rows[0]
            });
        }

        // --------------------------------------------
        // CREATE PAYMENT
        // --------------------------------------------

        const result = await db.query(
            `
            INSERT INTO membership_payments
            (
                user_id,
                membership_tier,
                amount,
                phone,
                status
            )
            VALUES
            ($1, $2, $3, $4, 'pending')
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
                userId,
                tierKey,
                tier.fee,
                cleanPhone
            ]
        );

        return res.status(201).json({
            success: true,
            message:
                "Membership payment request created successfully.",
            payment: result.rows[0]
        });

    } catch (error) {

        console.error(
            "CREATE MEMBERSHIP PAYMENT ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to create membership payment."
        });

    }
}


// ============================================
// GET CURRENT MEMBERSHIP
// ============================================

async function getMembershipStatus(req, res) {

    try {

        const userId = req.user.id;

        const result = await db.query(
            `
            SELECT
                id,
                membership_tier,
                membership_fee,
                membership_activated_at,
                referral_code
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

        const tier =
            getMembershipTier(
                user.membership_tier || "free"
            );

        return res.json({
            success: true,
            user: {
                id: user.id,
                referral_code: user.referral_code
            },
            membership: {
                tier: user.membership_tier || "free",
                name: tier.name,
                fee: user.membership_fee || 0,
                rank: tier.rank,
                activatedAt:
                    user.membership_activated_at
            }
        });

    } catch (error) {

        console.error(
            "GET MEMBERSHIP STATUS ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Unable to load membership status."
        });

    }
}


module.exports = {
    createMembershipPayment,
    getMembershipStatus
};
