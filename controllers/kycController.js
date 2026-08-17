const db = require("../config/db");


// ============================================
// GET MY KYC PROFILE
// ============================================

async function getMyKyc(req, res) {

    try {

        const userId = req.user.id;

        const result = await db.query(
            `
            SELECT
                kp.id,
                kp.user_id,
                kp.status,
                kp.provider,
                kp.provider_reference,
                kp.verification_level,
                kp.country,
                kp.risk_level,
                kp.rejection_reason,
                kp.submitted_at,
                kp.reviewed_at,
                kp.expires_at,
                kp.created_at,
                kp.updated_at
            FROM kyc_profiles kp
            WHERE kp.user_id = $1
            `,
            [userId]
        );


        if (result.rows.length === 0) {

            return res.json({
                message: "KYC profile not started.",
                kyc: null
            });

        }


        return res.json({
            message: "KYC profile retrieved successfully.",
            kyc: result.rows[0]
        });


    } catch (error) {

        console.error(
            "GET MY KYC ERROR:",
            error
        );

        return res.status(500).json({
            message: "Unable to retrieve KYC profile."
        });

    }

}


// ============================================
// START KYC
// ============================================

async function startKyc(req, res) {

    try {

        const userId = req.user.id;

        const {
            country
        } = req.body;


        const result = await db.query(
            `
            INSERT INTO kyc_profiles
            (
                user_id,
                country,
                status
            )
            VALUES
            (
                $1,
                $2,
                'not_started'
            )
            ON CONFLICT (user_id)
            DO UPDATE SET
                country = COALESCE(
                    EXCLUDED.country,
                    kyc_profiles.country
                ),
                updated_at = NOW()
            RETURNING
                id,
                user_id,
                status,
                country,
                provider,
                provider_reference,
                verification_level,
                risk_level,
                rejection_reason,
                submitted_at,
                reviewed_at,
                expires_at,
                created_at,
                updated_at
            `,
            [
                userId,
                country || null
            ]
        );


        return res.status(201).json({
            message: "KYC profile ready.",
            kyc: result.rows[0]
        });


    } catch (error) {

        console.error(
            "START KYC ERROR:",
            error
        );

        return res.status(500).json({
            message: "Unable to start KYC."
        });

    }

}


// ============================================
// SUBMIT KYC FOR REVIEW
// ============================================

async function submitKyc(req, res) {

    try {

        const userId = req.user.id;


        const result = await db.query(
            `
            UPDATE kyc_profiles
            SET
                status = 'pending',
                submitted_at = NOW(),
                rejection_reason = NULL,
                updated_at = NOW()
            WHERE user_id = $1
            AND status IN (
                'not_started',
                'rejected'
            )
            RETURNING
                id,
                user_id,
                status,
                country,
                provider,
                provider_reference,
                verification_level,
                risk_level,
                rejection_reason,
                submitted_at,
                reviewed_at,
                expires_at,
                created_at,
                updated_at
            `,
            [userId]
        );


        if (result.rows.length === 0) {

            const existing = await db.query(
                `
                SELECT
                    id,
                    user_id,
                    status,
                    country,
                    provider,
                    provider_reference,
                    verification_level,
                    risk_level,
                    rejection_reason,
                    submitted_at,
                    reviewed_at,
                    expires_at,
                    created_at,
                    updated_at
                FROM kyc_profiles
                WHERE user_id = $1
                `,
                [userId]
            );


            if (existing.rows.length === 0) {

                return res.status(404).json({
                    message:
                        "Start your KYC profile before submitting it."
                });

            }


            return res.status(400).json({
                message:
                    `KYC cannot be submitted while status is "${existing.rows[0].status}".`,
                kyc: existing.rows[0]
            });

        }


        return res.json({
            message: "KYC submitted for review.",
            kyc: result.rows[0]
        });


    } catch (error) {

        console.error(
            "SUBMIT KYC ERROR:",
            error
        );

        return res.status(500).json({
            message: "Unable to submit KYC."
        });

    }

}


// ============================================
// EXPORT
// ============================================

module.exports = {
    getMyKyc,
    startKyc,
    submitKyc
};
