const db = require("../config/db");

/*
================================================
SMARTMINUTE ADMIN ASSISTANT
================================================

Central automation service for routine
administrative monitoring.

IMPORTANT:
This service does NOT directly modify wallet
balances or approve financial transactions.

Financial actions remain controlled by the
existing payment/deposit services and admin
approval routes.
*/


// ============================================
// SYSTEM OVERVIEW
// ============================================

async function getSystemOverview() {

    const result = await db.query(`
        SELECT

            (
                SELECT COUNT(*)
                FROM users
            ) AS total_users,

            (
                SELECT COUNT(*)
                FROM deposits
                WHERE status = 'pending'
            ) AS pending_deposits,

            (
                SELECT COUNT(*)
                FROM withdrawals
                WHERE status = 'pending'
            ) AS pending_withdrawals,

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
                SELECT COUNT(*)
                FROM security_events
                WHERE created_at >= NOW() - INTERVAL '24 hours'
            ) AS security_events_24h
    `);

    return result.rows[0];
}


// ============================================
// PENDING DEPOSITS
// ============================================

async function getPendingDeposits() {

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
            d.checkout_request_id,
            d.created_at
        FROM deposits d
        LEFT JOIN users u
            ON u.id = d.user_id
        WHERE d.status = 'pending'
        ORDER BY d.created_at ASC
    `);

    return result.rows;
}


// ============================================
// PENDING WITHDRAWALS
// ============================================

async function getPendingWithdrawals() {

    const result = await db.query(`
        SELECT
            w.id,
            w.user_id,
            u.name AS user_name,
            u.email AS user_email,
            w.amount,
            w.currency,
            w.method,
            w.destination,
            w.status,
            w.created_at
        FROM withdrawals w
        LEFT JOIN users u
            ON u.id = w.user_id
        WHERE w.status = 'pending'
        ORDER BY w.created_at ASC
    `);

    return result.rows;
}


// ============================================
// CREATE USER NOTIFICATION
// ============================================

async function createNotification(
    userId,
    type,
    title,
    message
) {

    if (!userId) {
        throw new Error("userId is required.");
    }

    if (!type || !title || !message) {
        throw new Error(
            "Notification type, title and message are required."
        );
    }

    const result = await db.query(
        `
        INSERT INTO notifications
            (user_id, type, title, message)
        VALUES
            ($1, $2, $3, $4)
        RETURNING
            id,
            user_id,
            type,
            title,
            message,
            is_read,
            created_at
        `,
        [
            userId,
            type,
            title,
            message
        ]
    );

    return result.rows[0];
}


// ============================================
// GET USER NOTIFICATIONS
// ============================================

async function getUserNotifications(
    userId,
    limit = 30
) {

    const safeLimit = Math.min(
        Math.max(Number(limit) || 30, 1),
        100
    );

    const result = await db.query(
        `
        SELECT
            id,
            user_id,
            type,
            title,
            message,
            is_read,
            created_at
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        `,
        [
            userId,
            safeLimit
        ]
    );

    return result.rows;
}


// ============================================
// MARK NOTIFICATION AS READ
// ============================================

async function markNotificationRead(
    notificationId,
    userId
) {

    const result = await db.query(
        `
        UPDATE notifications
        SET is_read = TRUE
        WHERE id = $1
          AND user_id = $2
        RETURNING
            id,
            user_id,
            type,
            title,
            message,
            is_read,
            created_at
        `,
        [
            notificationId,
            userId
        ]
    );

    return result.rows[0] || null;
}


// ============================================
// ADMIN ASSISTANT AUDIT LOG
// ============================================

async function logAction({
    actionType,
    targetType = null,
    targetId = null,
    severity = "info",
    message,
    metadata = null
}) {

    if (!actionType || !message) {
        throw new Error(
            "actionType and message are required."
        );
    }

    const allowedSeverities = [
        "info",
        "warning",
        "critical"
    ];

    if (!allowedSeverities.includes(severity)) {
        throw new Error(
            "Invalid assistant log severity."
        );
    }

    const result = await db.query(
        `
        INSERT INTO admin_assistant_logs
            (
                action_type,
                target_type,
                target_id,
                severity,
                message,
                metadata
            )
        VALUES
            ($1, $2, $3, $4, $5, $6)
        RETURNING
            id,
            action_type,
            target_type,
            target_id,
            severity,
            message,
            metadata,
            created_at
        `,
        [
            actionType,
            targetType,
            targetId,
            severity,
            message,
            metadata
        ]
    );

    return result.rows[0];
}


// ============================================
// RECENT ASSISTANT LOGS
// ============================================

async function getRecentLogs(limit = 50) {

    const safeLimit = Math.min(
        Math.max(Number(limit) || 50, 1),
        100
    );

    const result = await db.query(
        `
        SELECT
            id,
            action_type,
            target_type,
            target_id,
            severity,
            message,
            metadata,
            created_at
        FROM admin_assistant_logs
        ORDER BY created_at DESC
        LIMIT $1
        `,
        [safeLimit]
    );

    return result.rows;
}


// ============================================
// HEALTH CHECK
// ============================================

async function runHealthCheck() {

    const overview =
        await getSystemOverview();

    return {
        status: "healthy",
        checked_at: new Date().toISOString(),
        overview
    };
}


module.exports = {
    getSystemOverview,
    getPendingDeposits,
    getPendingWithdrawals,

    createNotification,
    getUserNotifications,
    markNotificationRead,

    logAction,
    getRecentLogs,

    permanentlyTerminateUser,

    runHealthCheck
};


// ============================================
// PERMANENT ACCOUNT TERMINATION
// ============================================
//
// Permanently removes a normal user account.
//
// IMPORTANT:
// - Admin-only route calls this function.
// - Admin accounts cannot be terminated.
// - The operation is transactional.
// - Security evidence is written before deletion.
// - Existing foreign-key CASCADE rules remove
//   user-owned operational records.
// - SET NULL security/audit records remain.
//

async function permanentlyTerminateUser(
    targetUserId,
    reason,
    actorAdminId
) {

    const userId = Number(targetUserId);
    const adminId = Number(actorAdminId);

    if (!Number.isInteger(userId) || userId <= 0) {
        throw new Error("Invalid target user ID.");
    }

    if (!Number.isInteger(adminId) || adminId <= 0) {
        throw new Error("Invalid administrator ID.");
    }

    if (
        typeof reason !== "string" ||
        reason.trim().length < 10
    ) {
        throw new Error(
            "A termination reason of at least 10 characters is required."
        );
    }

    const client = await db.connect();

    try {

        await client.query("BEGIN");

        // --------------------------------------------
        // LOAD TARGET USER
        // --------------------------------------------

        const targetResult = await client.query(
            `
            SELECT
                id,
                name,
                email,
                role
            FROM users
            WHERE id = $1
            FOR UPDATE
            `,
            [userId]
        );

        if (targetResult.rows.length === 0) {
            throw new Error("Target user does not exist.");
        }

        const target = targetResult.rows[0];

        // --------------------------------------------
        // NEVER TERMINATE AN ADMIN ACCOUNT
        // --------------------------------------------

        if (target.role === "admin") {
            throw new Error(
                "Administrator accounts cannot be terminated by the assistant."
            );
        }

        // --------------------------------------------
        // VERIFY ACTING ADMIN STILL EXISTS
        // --------------------------------------------

        const adminResult = await client.query(
            `
            SELECT
                id,
                role
            FROM users
            WHERE id = $1
            LIMIT 1
            `,
            [adminId]
        );

        if (
            adminResult.rows.length === 0 ||
            adminResult.rows[0].role !== "admin"
        ) {
            throw new Error(
                "The acting administrator could not be verified."
            );
        }

        // --------------------------------------------
        // WRITE SECURITY EVENT BEFORE DELETE
        // user_id becomes NULL after user deletion
        // because security_events.user_id uses SET NULL.
        // --------------------------------------------

        await client.query(
            `
            INSERT INTO security_events
            (
                user_id,
                event_type,
                severity,
                metadata
            )
            VALUES
            (
                $1,
                'assistant_account_terminated',
                'critical',
                $2
            )
            `,
            [
                userId,
                JSON.stringify({
                    reason: reason.trim(),
                    terminated_by_admin_id: adminId,
                    target_email: target.email
                })
            ]
        );

        // --------------------------------------------
        // WRITE ADMIN ASSISTANT AUDIT LOG
        // This table intentionally does not depend on
        // the users row, so the audit record survives.
        // --------------------------------------------

        await client.query(
            `
            INSERT INTO admin_assistant_logs
            (
                action_type,
                target_type,
                target_id,
                severity,
                message,
                metadata
            )
            VALUES
            (
                'permanent_account_termination',
                'user',
                $1,
                'critical',
                $2,
                $3
            )
            `,
            [
                userId,
                `User account permanently terminated: ${target.email}`,
                JSON.stringify({
                    reason: reason.trim(),
                    terminated_by_admin_id: adminId,
                    target_email: target.email
                })
            ]
        );

        // --------------------------------------------
        // PERMANENT DELETE
        // --------------------------------------------

        const deleteResult = await client.query(
            `
            DELETE FROM users
            WHERE id = $1
              AND role <> 'admin'
            RETURNING
                id,
                email
            `,
            [userId]
        );

        if (deleteResult.rows.length === 0) {
            throw new Error(
                "Account termination failed."
            );
        }

        await client.query("COMMIT");

        return {
            terminated: true,
            user_id: userId,
            email: deleteResult.rows[0].email,
            reason: reason.trim(),
            terminated_by_admin_id: adminId
        };

    } catch (error) {

        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error(
                "TERMINATION ROLLBACK ERROR:",
                rollbackError
            );
        }

        throw error;

    } finally {

        client.release();
    }
}
