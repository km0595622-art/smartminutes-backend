const jwt = require("jsonwebtoken");
const db = require("../config/db");

async function authenticateToken(req, res, next) {

    try {

        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                message: "Authentication required."
            });
        }

        const parts = authHeader.split(" ");

        if (
            parts.length !== 2 ||
            parts[0] !== "Bearer" ||
            !parts[1]
        ) {
            return res.status(401).json({
                message: "Invalid authorization format."
            });
        }

        const token = parts[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_KEY
        );

        if (!decoded.id) {
            return res.status(401).json({
                message: "Invalid authentication token."
            });
        }

        /*
        ============================================
        CHECK ASSISTANT SECURITY STATE
        ============================================
        */

        const securityResult = await db.query(
            `
            SELECT
                assistant_frozen,
                assistant_freeze_reason,
                assistant_freeze_until,
                assistant_terminated,
                assistant_termination_reason
            FROM user_security
            WHERE user_id = $1
            LIMIT 1
            `,
            [decoded.id]
        );

        if (securityResult.rows.length === 0) {
            return res.status(401).json({
                message: "Security profile unavailable."
            });
        }

        const security = securityResult.rows[0];

        /*
        ============================================
        PERMANENTLY TERMINATED ACCOUNT
        ============================================
        */

        if (security.assistant_terminated) {

            return res.status(403).json({
                message:
                    "This account has been permanently terminated."
            });
        }

        /*
        ============================================
        TEMPORARILY FROZEN ACCOUNT
        ============================================
        */

        if (security.assistant_frozen) {

            const freezeUntil =
                security.assistant_freeze_until
                    ? new Date(security.assistant_freeze_until)
                    : null;

            /*
            Automatic expiry of temporary freeze.
            A permanent freeze has no expiry timestamp.
            */

            if (
                freezeUntil &&
                freezeUntil.getTime() <= Date.now()
            ) {

                await db.query(
                    `
                    UPDATE user_security
                    SET
                        assistant_frozen = FALSE,
                        assistant_freeze_reason = NULL,
                        assistant_frozen_at = NULL,
                        assistant_freeze_until = NULL,
                        updated_at = NOW()
                    WHERE user_id = $1
                    `,
                    [decoded.id]
                );

            } else {

                return res.status(403).json({
                    message:
                        "Account temporarily frozen for security review.",
                    frozen_until:
                        security.assistant_freeze_until || null
                });
            }
        }

        req.user = decoded;

        next();

    } catch (error) {

        console.error(
            "AUTHENTICATION ERROR:",
            error.message
        );

        return res.status(401).json({
            message: "Invalid or expired token."
        });
    }
}

module.exports = authenticateToken;
