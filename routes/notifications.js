const express = require("express");

const authenticateToken =
    require("../middleware/authMiddleware");

const adminAssistant =
    require("../services/adminAssistant");

const router = express.Router();


// ============================================
// GET USER NOTIFICATIONS
// ============================================

router.get(
    "/",
    authenticateToken,
    async (req, res) => {

        try {

            const limit =
                Number(req.query.limit) || 30;

            const notifications =
                await adminAssistant.getUserNotifications(
                    req.user.id,
                    limit
                );

            return res.json({
                success: true,
                count: notifications.length,
                notifications
            });

        } catch (error) {

            console.error(
                "NOTIFICATIONS GET ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load notifications."
            });
        }
    }
);


// ============================================
// GET UNREAD NOTIFICATION COUNT
// ============================================

router.get(
    "/unread-count",
    authenticateToken,
    async (req, res) => {

        try {

            const result =
                await require("../config/db").query(
                    `
                    SELECT COUNT(*) AS unread_count
                    FROM notifications
                    WHERE user_id = $1
                      AND is_read = FALSE
                    `,
                    [req.user.id]
                );

            return res.json({
                success: true,
                unread_count:
                    Number(
                        result.rows[0]?.unread_count || 0
                    )
            });

        } catch (error) {

            console.error(
                "NOTIFICATION UNREAD COUNT ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load unread notification count."
            });
        }
    }
);


// ============================================
// MARK ONE NOTIFICATION AS READ
// ============================================

router.patch(
    "/:id/read",
    authenticateToken,
    async (req, res) => {

        try {

            const notificationId =
                Number(req.params.id);

            if (
                !Number.isInteger(notificationId) ||
                notificationId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid notification ID."
                });
            }

            const notification =
                await adminAssistant.markNotificationRead(
                    notificationId,
                    req.user.id
                );

            if (!notification) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Notification not found."
                });
            }

            return res.json({
                success: true,
                notification
            });

        } catch (error) {

            console.error(
                "NOTIFICATION READ ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to mark notification as read."
            });
        }
    }
);


// ============================================
// MARK ALL NOTIFICATIONS AS READ
// ============================================

router.patch(
    "/read-all",
    authenticateToken,
    async (req, res) => {

        try {

            const result =
                await require("../config/db").query(
                    `
                    UPDATE notifications
                    SET is_read = TRUE
                    WHERE user_id = $1
                      AND is_read = FALSE
                    `,
                    [req.user.id]
                );

            return res.json({
                success: true,
                marked_read:
                    result.rowCount || 0
            });

        } catch (error) {

            console.error(
                "NOTIFICATIONS READ ALL ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to mark notifications as read."
            });
        }
    }
);


module.exports = router;
