const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");


// ============================================
// SECURITY SETTINGS
// ============================================

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;


// ============================================
// GET CLIENT IP
// ============================================

function getClientIp(req) {
    return (
        req.ip ||
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.socket?.remoteAddress ||
        null
    );
}


// ============================================
// GET USER AGENT
// ============================================

function getUserAgent(req) {
    return req.get("user-agent") || null;
}


// ============================================
// WRITE SECURITY EVENT
// ============================================

async function createSecurityEvent(
    client,
    {
        userId = null,
        eventType,
        severity = "info",
        ipAddress = null,
        userAgent = null,
        metadata = {}
    }
) {
    await client.query(
        `
        INSERT INTO security_events
        (
            user_id,
            event_type,
            severity,
            ip_address,
            user_agent,
            metadata
        )
        VALUES
        (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6
        )
        `,
        [
            userId,
            eventType,
            severity,
            ipAddress,
            userAgent,
            metadata
        ]
    );
}


// ============================================
// REGISTER USER + CREATE WALLET + SECURITY
// ============================================

exports.register = async (req, res) => {

    const client = await db.connect();

    try {

        const {
            name,
            email,
            password
        } = req.body;

        // --------------------------------------------
        // BASIC VALIDATION
        // --------------------------------------------

        if (!name || !email || !password) {

            return res.status(400).json({
                message: "Name, email and password are required"
            });
        }

        const normalizedEmail = String(email)
            .trim()
            .toLowerCase();

        if (password.length < 6) {

            return res.status(400).json({
                message: "Password must be at least 6 characters"
            });
        }

        // --------------------------------------------
        // START TRANSACTION
        // --------------------------------------------

        await client.query("BEGIN");

        // --------------------------------------------
        // CHECK EXISTING USER
        // --------------------------------------------

        const existing = await client.query(
            `
            SELECT id
            FROM users
            WHERE LOWER(email) = LOWER($1)
            LIMIT 1
            `,
            [normalizedEmail]
        );

        if (existing.rows.length > 0) {

            await client.query("ROLLBACK");

            return res.status(400).json({
                message: "Email already exists"
            });
        }

        // --------------------------------------------
        // HASH PASSWORD
        // --------------------------------------------

        const hashedPassword = await bcrypt.hash(
            password,
            10
        );

        // --------------------------------------------
        // CREATE USER
        // --------------------------------------------

        const userResult = await client.query(
            `
            INSERT INTO users
            (
                name,
                email,
                password
            )
            VALUES
            (
                $1,
                $2,
                $3
            )
            RETURNING
                id,
                name,
                email,
                trading_unlocked,
                unlock_fee_paid,
                unlock_paid_at
            `,
            [
                name,
                normalizedEmail,
                hashedPassword
            ]
        );

        const user = userResult.rows[0];

        // --------------------------------------------
        // CREATE WALLET
        // --------------------------------------------

        await client.query(
            `
            INSERT INTO wallets
            (
                user_id,
                currency,
                balance,
                withdrawable_balance,
                locked_balance
            )
            VALUES
            (
                $1,
                'KES',
                0.00,
                0.00,
                0.00
            )
            `,
            [user.id]
        );

        // --------------------------------------------
        // CREATE SECURITY PROFILE
        // --------------------------------------------

        await client.query(
            `
            INSERT INTO user_security
            (
                user_id
            )
            VALUES
            (
                $1
            )
            ON CONFLICT (user_id)
            DO NOTHING
            `,
            [user.id]
        );

        // --------------------------------------------
        // SECURITY EVENT
        // --------------------------------------------

        await createSecurityEvent(client, {
            userId: user.id,
            eventType: "account_registered",
            severity: "info",
            ipAddress: getClientIp(req),
            userAgent: getUserAgent(req),
            metadata: {
                registration: "password"
            }
        });

        // --------------------------------------------
        // COMMIT
        // --------------------------------------------

        await client.query("COMMIT");

        return res.status(201).json({
            message: "Account created successfully",
            user
        });

    } catch (err) {

        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "REGISTER ROLLBACK ERROR:",
                rollbackError
            );
        }

        console.error(
            "REGISTER ERROR:",
            err
        );

        // PostgreSQL unique violation
        if (err.code === "23505") {

            return res.status(400).json({
                message: "Email already exists"
            });
        }

        return res.status(500).json({
            message: "Server error"
        });

    } finally {

        client.release();
    }
};


// ============================================
// LOGIN
// ============================================

exports.login = async (req, res) => {

    const client = await db.connect();

    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);

    try {

        const {
            email,
            password
        } = req.body;

        // --------------------------------------------
        // BASIC VALIDATION
        // --------------------------------------------

        if (!email || !password) {

            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        const normalizedEmail = String(email)
            .trim()
            .toLowerCase();

        // --------------------------------------------
        // FIND USER
        // --------------------------------------------

        const userResult = await client.query(
            `
            SELECT
                id,
                name,
                email,
                password,
                role,
                trading_unlocked,
                unlock_fee_paid,
                unlock_paid_at
            FROM users
            WHERE LOWER(email) = LOWER($1)
            LIMIT 1
            `,
            [normalizedEmail]
        );

        if (userResult.rows.length === 0) {

            await client.query("BEGIN");

            await createSecurityEvent(client, {
                userId: null,
                eventType: "login_failed_unknown_user",
                severity: "warning",
                ipAddress,
                userAgent,
                metadata: {
                    reason: "invalid_credentials"
                }
            });

            await client.query("COMMIT");

            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const user = userResult.rows[0];

        // --------------------------------------------
        // ENSURE SECURITY PROFILE EXISTS
        // --------------------------------------------

        await client.query(
            `
            INSERT INTO user_security
            (
                user_id
            )
            VALUES
            (
                $1
            )
            ON CONFLICT (user_id)
            DO NOTHING
            `,
            [user.id]
        );

        // --------------------------------------------
        // LOCK USER SECURITY ROW
        // --------------------------------------------

        await client.query("BEGIN");

        const securityResult = await client.query(
            `
            SELECT
                user_id,
                email_verified,
                phone_verified,
                two_factor_enabled,
                failed_login_attempts,
                locked_until,
                password_changed_at,
                last_login_at,
                last_login_ip
            FROM user_security
            WHERE user_id = $1
            FOR UPDATE
            `,
            [user.id]
        );

        if (securityResult.rows.length === 0) {

            throw new Error(
                "User security profile could not be loaded."
            );
        }

        const security = securityResult.rows[0];

        // --------------------------------------------
        // CHECK ACCOUNT LOCK
        // --------------------------------------------

        if (
            security.locked_until &&
            new Date(security.locked_until).getTime() > Date.now()
        ) {

            await createSecurityEvent(client, {
                userId: user.id,
                eventType: "login_blocked_locked_account",
                severity: "warning",
                ipAddress,
                userAgent,
                metadata: {
                    locked_until: security.locked_until
                }
            });

            await client.query("COMMIT");

            return res.status(429).json({
                message:
                    "Account temporarily locked due to multiple failed login attempts. Please try again later.",
                locked_until: security.locked_until
            });
        }

        // --------------------------------------------
        // CLEAR EXPIRED LOCK
        // --------------------------------------------

        if (
            security.locked_until &&
            new Date(security.locked_until).getTime() <= Date.now()
        ) {

            await client.query(
                `
                UPDATE user_security
                SET
                    failed_login_attempts = 0,
                    locked_until = NULL,
                    updated_at = NOW()
                WHERE user_id = $1
                `,
                [user.id]
            );

            security.failed_login_attempts = 0;
            security.locked_until = null;
        }

        // --------------------------------------------
        // CHECK PASSWORD
        // --------------------------------------------

        const passwordMatch = await bcrypt.compare(
            password,
            user.password
        );

        // --------------------------------------------
        // FAILED LOGIN
        // --------------------------------------------

        if (!passwordMatch) {

            const nextFailedAttempts =
                Number(security.failed_login_attempts || 0) + 1;

            let lockedUntil = null;
            let eventSeverity = "warning";
            let eventType = "login_failed";

            if (
                nextFailedAttempts >=
                MAX_FAILED_LOGIN_ATTEMPTS
            ) {

                lockedUntil = new Date(
                    Date.now() +
                    LOCKOUT_MINUTES * 60 * 1000
                );

                eventSeverity = "critical";
                eventType = "account_locked";
            }

            await client.query(
                `
                UPDATE user_security
                SET
                    failed_login_attempts = $1,
                    locked_until = $2,
                    updated_at = NOW()
                WHERE user_id = $3
                `,
                [
                    nextFailedAttempts,
                    lockedUntil,
                    user.id
                ]
            );

            await createSecurityEvent(client, {
                userId: user.id,
                eventType,
                severity: eventSeverity,
                ipAddress,
                userAgent,
                metadata: {
                    failed_attempts: nextFailedAttempts,
                    lockout_minutes:
                        lockedUntil
                            ? LOCKOUT_MINUTES
                            : 0
                }
            });

            await client.query("COMMIT");

            if (lockedUntil) {

                return res.status(429).json({
                    message:
                        "Too many failed login attempts. Account temporarily locked.",
                    locked_until: lockedUntil
                });
            }

            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        // --------------------------------------------
        // SUCCESSFUL LOGIN
        // --------------------------------------------

        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role
            },
            process.env.JWT_KEY,
            {
                expiresIn: "7d"
            }
        );

        // --------------------------------------------
        // UPDATE SECURITY PROFILE
        // --------------------------------------------

        await client.query(
            `
            UPDATE user_security
            SET
                failed_login_attempts = 0,
                locked_until = NULL,
                last_login_at = NOW(),
                last_login_ip = $1,
                updated_at = NOW()
            WHERE user_id = $2
            `,
            [
                ipAddress,
                user.id
            ]
        );

        // --------------------------------------------
        // SECURITY EVENT
        // --------------------------------------------

        await createSecurityEvent(client, {
            userId: user.id,
            eventType: "login_success",
            severity: "info",
            ipAddress,
            userAgent,
            metadata: {
                authentication: "password_jwt"
            }
        });

        // --------------------------------------------
        // COMMIT
        // --------------------------------------------

        await client.query("COMMIT");

        // --------------------------------------------
        // RESPONSE
        // --------------------------------------------

        return res.json({
            message: "Login successful",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });

    } catch (err) {

        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "LOGIN ROLLBACK ERROR:",
                rollbackError
            );
        }

        console.error(
            "LOGIN ERROR:",
            err
        );

        return res.status(500).json({
            message: "Server error"
        });

    } finally {

        client.release();
    }
};
