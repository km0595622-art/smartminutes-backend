const express = require("express");

const db = require("../config/db");
const authenticateToken = require("../middleware/authMiddleware");
const requireAdmin = require("../middleware/adminMiddleware");

const router = express.Router();


// ============================================
// ADMIN — GET ALL KYC PROFILES
// ============================================

router.get(
    "/",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const result = await db.query(`
                SELECT
                    kp.id,
                    kp.user_id,
                    u.name AS user_name,
                    u.email AS user_email,
                    kp.status,
                    kp.provider,
                    kp.provider_reference,
                    kp.verification_level,
                    kp.country,
                    kp.risk_level,
                    kp.rejection_reason,
                    kp.reviewed_by,
                    kp.submitted_at,
                    kp.reviewed_at,
                    kp.expires_at,
                    kp.created_at,
                    kp.updated_at
                FROM kyc_profiles kp
                LEFT JOIN users u
                    ON u.id = kp.user_id
                ORDER BY
                    CASE
                        WHEN kp.status = 'pending' THEN 0
                        WHEN kp.status = 'under_review' THEN 1
                        ELSE 2
                    END,
                    kp.created_at DESC
            `);

            return res.json({
                message: "KYC profiles retrieved successfully.",
                kyc: result.rows
            });

        } catch (error) {

            console.error(
                "ADMIN GET KYC ERROR:",
                error
            );

            return res.status(500).json({
                message: "Unable to retrieve KYC profiles."
            });

        }

    }
);


// ============================================
// ADMIN — GET KYC PROFILE + DOCUMENTS
// ============================================

router.get(
    "/:id",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const kycId = Number(req.params.id);

            if (!Number.isInteger(kycId) || kycId <= 0) {

                return res.status(400).json({
                    message: "Invalid KYC ID."
                });

            }

            const profileResult = await db.query(
                `
                SELECT
                    kp.id,
                    kp.user_id,
                    u.name AS user_name,
                    u.email AS user_email,
                    kp.status,
                    kp.provider,
                    kp.provider_reference,
                    kp.verification_level,
                    kp.country,
                    kp.risk_level,
                    kp.rejection_reason,
                    kp.reviewed_by,
                    kp.submitted_at,
                    kp.reviewed_at,
                    kp.expires_at,
                    kp.created_at,
                    kp.updated_at
                FROM kyc_profiles kp
                LEFT JOIN users u
                    ON u.id = kp.user_id
                WHERE kp.id = $1
                `,
                [kycId]
            );

            if (profileResult.rows.length === 0) {

                return res.status(404).json({
                    message: "KYC profile not found."
                });

            }

            const documentsResult = await db.query(
                `
                SELECT
                    id,
                    kyc_profile_id,
                    document_type,
                    document_country,
                    provider,
                    provider_document_reference,
                    verification_status,
                    rejection_reason,
                    created_at,
                    updated_at
                FROM kyc_documents
                WHERE kyc_profile_id = $1
                ORDER BY created_at ASC
                `,
                [kycId]
            );

            return res.json({
                message: "KYC profile retrieved successfully.",
                kyc: profileResult.rows[0],
                documents: documentsResult.rows
            });

        } catch (error) {

            console.error(
                "ADMIN GET KYC DETAILS ERROR:",
                error
            );

            return res.status(500).json({
                message: "Unable to retrieve KYC details."
            });

        }

    }
);


// ============================================
// ADMIN — APPROVE KYC
// ============================================

router.post(
    "/:id/approve",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        const client = await db.connect();

        try {

            const kycId = Number(req.params.id);

            if (!Number.isInteger(kycId) || kycId <= 0) {

                return res.status(400).json({
                    message: "Invalid KYC ID."
                });

            }

            const {
                verification_level,
                risk_level,
                provider,
                provider_reference,
                expires_at
            } = req.body;

            const level =
                verification_level || "standard";

            const risk =
                risk_level || "low";

            if (
                ![
                    "unknown",
                    "low",
                    "medium",
                    "high"
                ].includes(risk)
            ) {

                return res.status(400).json({
                    message: "Invalid risk level."
                });

            }

            await client.query("BEGIN");

            const profileResult = await client.query(
                `
                SELECT
                    id,
                    user_id,
                    status
                FROM kyc_profiles
                WHERE id = $1
                FOR UPDATE
                `,
                [kycId]
            );

            if (profileResult.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(404).json({
                    message: "KYC profile not found."
                });

            }

            const profile = profileResult.rows[0];

            if (
                profile.status !== "pending" &&
                profile.status !== "under_review"
            ) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    message:
                        `KYC cannot be approved while status is "${profile.status}".`
                });

            }

            const updatedProfile = await client.query(
                `
                UPDATE kyc_profiles
                SET
                    status = 'approved',
                    provider = COALESCE($2, provider),
                    provider_reference = COALESCE($3, provider_reference),
                    verification_level = $4,
                    risk_level = $5,
                    rejection_reason = NULL,
                    reviewed_by = $6,
                    reviewed_at = NOW(),
                    expires_at = $7,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING
                    id,
                    user_id,
                    status,
                    provider,
                    provider_reference,
                    verification_level,
                    country,
                    risk_level,
                    rejection_reason,
                    reviewed_by,
                    submitted_at,
                    reviewed_at,
                    expires_at,
                    created_at,
                    updated_at
                `,
                [
                    kycId,
                    provider || null,
                    provider_reference || null,
                    level,
                    risk,
                    req.user.id,
                    expires_at || null
                ]
            );

            await client.query(
                `
                UPDATE kyc_documents
                SET
                    verification_status = 'verified',
                    rejection_reason = NULL,
                    updated_at = NOW()
                WHERE kyc_profile_id = $1
                  AND verification_status = 'pending'
                `,
                [kycId]
            );


            // ============================================
            // KYC AUDIT LOG — APPROVED
            // ============================================

            await client.query(
                `
                INSERT INTO kyc_audit_logs
                (
                    kyc_profile_id,
                    user_id,
                    actor_user_id,
                    action,
                    old_status,
                    new_status,
                    details
                )
                VALUES
                (
                    $1,
                    $2,
                    $3,
                    'approved',
                    $4,
                    'approved',
                    $5::jsonb
                )
                `,
                [
                    kycId,
                    profile.user_id,
                    req.user.id,
                    profile.status,
                    JSON.stringify({
                        verification_level: level,
                        risk_level: risk,
                        provider: provider || null,
                        provider_reference: provider_reference || null,
                        expires_at: expires_at || null
                    })
                ]
            );

            await client.query("COMMIT");

            return res.json({
                message: "KYC approved successfully.",
                kyc: updatedProfile.rows[0]
            });

        } catch (error) {

            try {
                await client.query("ROLLBACK");
            } catch (_) {}

            console.error(
                "ADMIN APPROVE KYC ERROR:",
                error
            );

            return res.status(500).json({
                message: "Unable to approve KYC."
            });

        } finally {

            client.release();

        }

    }
);


// ============================================
// ADMIN — REJECT KYC
// ============================================

router.post(
    "/:id/reject",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        const client = await db.connect();

        try {

            const kycId = Number(req.params.id);

            if (!Number.isInteger(kycId) || kycId <= 0) {

                return res.status(400).json({
                    message: "Invalid KYC ID."
                });

            }

            const {
                rejection_reason,
                risk_level
            } = req.body;

            const reason =
                typeof rejection_reason === "string" &&
                rejection_reason.trim()
                    ? rejection_reason.trim()
                    : "KYC verification was rejected.";

            const risk =
                risk_level || "medium";

            if (
                ![
                    "unknown",
                    "low",
                    "medium",
                    "high"
                ].includes(risk)
            ) {

                return res.status(400).json({
                    message: "Invalid risk level."
                });

            }

            await client.query("BEGIN");

            const profileResult = await client.query(
                `
                SELECT
                    id,
                    user_id,
                    status
                FROM kyc_profiles
                WHERE id = $1
                FOR UPDATE
                `,
                [kycId]
            );

            if (profileResult.rows.length === 0) {

                await client.query("ROLLBACK");

                return res.status(404).json({
                    message: "KYC profile not found."
                });

            }

            const profile = profileResult.rows[0];

            if (
                profile.status !== "pending" &&
                profile.status !== "under_review"
            ) {

                await client.query("ROLLBACK");

                return res.status(400).json({
                    message:
                        `KYC cannot be rejected while status is "${profile.status}".`
                });

            }

            const updatedProfile = await client.query(
                `
                UPDATE kyc_profiles
                SET
                    status = 'rejected',
                    risk_level = $2,
                    rejection_reason = $3,
                    reviewed_by = $4,
                    reviewed_at = NOW(),
                    updated_at = NOW()
                WHERE id = $1
                RETURNING
                    id,
                    user_id,
                    status,
                    provider,
                    provider_reference,
                    verification_level,
                    country,
                    risk_level,
                    rejection_reason,
                    reviewed_by,
                    submitted_at,
                    reviewed_at,
                    expires_at,
                    created_at,
                    updated_at
                `,
                [
                    kycId,
                    risk,
                    reason,
                    req.user.id
                ]
            );

            await client.query(
                `
                UPDATE kyc_documents
                SET
                    verification_status = 'rejected',
                    rejection_reason = $2,
                    updated_at = NOW()
                WHERE kyc_profile_id = $1
                  AND verification_status = 'pending'
                `,
                [
                    kycId,
                    reason
                ]
            );


            // ============================================
            // KYC AUDIT LOG — REJECTED
            // ============================================

            await client.query(
                `
                INSERT INTO kyc_audit_logs
                (
                    kyc_profile_id,
                    user_id,
                    actor_user_id,
                    action,
                    old_status,
                    new_status,
                    details
                )
                VALUES
                (
                    $1,
                    $2,
                    $3,
                    'rejected',
                    $4,
                    'rejected',
                    $5::jsonb
                )
                `,
                [
                    kycId,
                    profile.user_id,
                    req.user.id,
                    'rejected',
                    JSON.stringify({
                        rejection_reason: reason,
                        risk_level: risk
                    })
                ]
            );

            await client.query("COMMIT");

            return res.json({
                message: "KYC rejected successfully.",
                kyc: updatedProfile.rows[0]
            });

        } catch (error) {

            try {
                await client.query("ROLLBACK");
            } catch (_) {}

            console.error(
                "ADMIN REJECT KYC ERROR:",
                error
            );

            return res.status(500).json({
                message: "Unable to reject KYC."
            });

        } finally {

            client.release();

        }

    }
);


module.exports = router;
