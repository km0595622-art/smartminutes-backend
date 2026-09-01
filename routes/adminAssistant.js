const express = require("express");

const authenticateToken =
    require("../middleware/authMiddleware");

const requireAdmin =
    require("../middleware/adminMiddleware");

const adminAssistant =
    require("../services/adminAssistant");

const router = express.Router();


/*
================================================
ADMIN ASSISTANT — SYSTEM OVERVIEW
================================================
*/

router.get(
    "/overview",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const overview =
                await adminAssistant.getSystemOverview();

            return res.json({
                success: true,
                assistant: "SmartMinute Admin Assistant",
                overview
            });

        } catch (error) {

            console.error(
                "ADMIN ASSISTANT OVERVIEW ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load assistant overview."
            });

        }

    }
);


/*
================================================
ADMIN ASSISTANT — PENDING DEPOSITS
================================================
*/

router.get(
    "/pending-deposits",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const deposits =
                await adminAssistant.getPendingDeposits();

            return res.json({
                success: true,
                count: deposits.length,
                deposits
            });

        } catch (error) {

            console.error(
                "ADMIN ASSISTANT DEPOSITS ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load pending deposits."
            });

        }

    }
);


/*
================================================
ADMIN ASSISTANT — PENDING WITHDRAWALS
================================================
*/

router.get(
    "/pending-withdrawals",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const withdrawals =
                await adminAssistant.getPendingWithdrawals();

            return res.json({
                success: true,
                count: withdrawals.length,
                withdrawals
            });

        } catch (error) {

            console.error(
                "ADMIN ASSISTANT WITHDRAWALS ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to load pending withdrawals."
            });

        }

    }
);


/*
================================================
ADMIN ASSISTANT — HEALTH CHECK
================================================
*/

router.get(
    "/health",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const health =
                await adminAssistant.runHealthCheck();

            return res.json({
                success: true,
                health
            });

        } catch (error) {

            console.error(
                "ADMIN ASSISTANT HEALTH ERROR:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to perform health check."
            });

        }

    }
);


module.exports = router;


/*
================================================
ADMIN ASSISTANT — PERMANENT ACCOUNT TERMINATION
================================================

This endpoint requires explicit administrator
action. The assistant does not autonomously delete
accounts based only on suspicion.
*/

router.delete(
    "/users/:userId/terminate",
    authenticateToken,
    requireAdmin,
    async (req, res) => {

        try {

            const targetUserId =
                Number(req.params.userId);

            const reason =
                typeof req.body?.reason === "string"
                    ? req.body.reason.trim()
                    : "";

            if (
                !Number.isInteger(targetUserId) ||
                targetUserId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid target user ID."
                });
            }

            if (reason.length < 10) {
                return res.status(400).json({
                    success: false,
                    message:
                        "A termination reason of at least 10 characters is required."
                });
            }

            const result =
                await adminAssistant.permanentlyTerminateUser(
                    targetUserId,
                    reason,
                    req.user.id
                );

            return res.json({
                success: true,
                message:
                    "User account permanently terminated.",
                termination: result
            });

        } catch (error) {

            console.error(
                "ADMIN ASSISTANT TERMINATION ERROR:",
                error
            );

            const message =
                error?.message ||
                "Unable to terminate account.";

            if (
                message.includes("does not exist") ||
                message.includes("Invalid target") ||
                message.includes("cannot be terminated") ||
                message.includes("could not be verified") ||
                message.includes("termination failed")
            ) {
                return res.status(400).json({
                    success: false,
                    message
                });
            }

            return res.status(500).json({
                success: false,
                message:
                    "Unable to terminate account."
            });
        }
    }
);


module.exports = router;
