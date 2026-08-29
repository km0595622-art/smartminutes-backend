const db = require("../config/db");
const {
    getMembershipTier,
    hasMembershipAccess
} = require("../config/membership");


// ============================================
// GET AVAILABLE TASKS
// ============================================

async function getTasks(req, res) {

    try {

        const userId = req.user.id;
        const isAdmin = req.user.role === "admin";

        const userResult = await db.query(
            `
            SELECT
                id,
                trading_unlocked,
                membership_tier,
                role
            FROM users
            WHERE id = $1
            `,
            [userId]
        );

        const user = userResult.rows[0];

        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        const result = await db.query(
            `
            SELECT
                id,
                title,
                category,
                description,
                reward,
                requirements,
                risk_notice,
                provider,
                external_url,
                requires_unlock,
                required_membership,
                created_at
            FROM tasks
            WHERE is_active = TRUE
            ORDER BY created_at DESC
            `
        );

        const availableTasks = result.rows.filter(task => {
            if (isAdmin) {
                return true;
            }

            return hasMembershipAccess(
                user.membership_tier || "free",
                task.required_membership || "free"
            );
        });

        res.json({
            tradingUnlocked: user.trading_unlocked,
            membershipTier: user.membership_tier || "free",
            membershipName: getMembershipTier(
                user.membership_tier || "free"
            ).name,
            isAdmin,
            tasks: availableTasks
        });

    } catch (error) {

        console.error("GET TASKS ERROR:", error);

        res.status(500).json({
            message: "Failed to load tasks."
        });

    }
}


// ============================================
// START TASK
// ============================================

async function startTask(req, res) {

    try {

        const userId = req.user.id;
        const taskId = Number(req.params.id);

        if (!Number.isInteger(taskId)) {
            return res.status(400).json({
                message: "Invalid task ID."
            });
        }

        const taskResult = await db.query(
            `
            SELECT
                id,
                title,
                category,
                requires_unlock,
                required_membership,
                is_active
            FROM tasks
            WHERE id = $1
            `,
            [taskId]
        );

        const task = taskResult.rows[0];

        if (!task || !task.is_active) {
            return res.status(404).json({
                message: "Task not found."
            });
        }

        if (req.user.role !== "admin") {

            // Minimum balance required to start earning
            const walletResult = await db.query(
                `
                SELECT withdrawable_balance
                FROM wallets
                WHERE user_id = $1
                `,
                [userId]
            );

            const withdrawableBalance = Number(
                walletResult.rows[0]?.withdrawable_balance || 0
            );

            if (withdrawableBalance < 50) {
                return res.status(403).json({
                    message: "Insufficient balance. Please fund your account.",
                    requiredBalance: 50,
                    currentBalance: withdrawableBalance
                });
            }

            const userResult = await db.query(
                `
                SELECT
                    membership_tier,
                    trading_unlocked
                FROM users
                WHERE id = $1
                `,
                [userId]
            );

            const user = userResult.rows[0];

            const userTier = user?.membership_tier || "free";
            const requiredTier = task.required_membership || "free";
            const tradingUnlocked = user?.trading_unlocked === true;

            if (!hasMembershipAccess(userTier, requiredTier)) {
                return res.status(403).json({
                    message: `This task requires ${getMembershipTier(requiredTier).name} membership or higher.`,
                    requiredMembership: requiredTier,
                    membershipTier: userTier
                });
            }

            if (task.requires_unlock && !tradingUnlocked) {
                return res.status(403).json({
                    message: "This task requires trading access to be unlocked.",
                    requiresUnlock: true,
                    tradingUnlocked: false
                });
            }
        }

        const existingResult = await db.query(
            `
            SELECT id
            FROM task_attempts
            WHERE user_id = $1
            AND task_id = $2
            AND status IN ('started', 'submitted')
            LIMIT 1
            `,
            [userId, taskId]
        );

        if (existingResult.rows.length > 0) {
            return res.json({
                message: "You already have an active attempt for this task.",
                attempt: existingResult.rows[0]
            });
        }

        const attemptResult = await db.query(
            `
            INSERT INTO task_attempts
            (
                user_id,
                task_id,
                status
            )
            VALUES
            ($1, $2, 'started')
            RETURNING
                id,
                user_id,
                task_id,
                status,
                started_at
            `,
            [userId, taskId]
        );

        res.status(201).json({
            message: "Task started successfully.",
            attempt: attemptResult.rows[0]
        });

    } catch (error) {

        console.error("START TASK ERROR:", error);

        res.status(500).json({
            message: "Failed to start task."
        });

    }
}


// ============================================
// SUBMIT TASK
// ============================================

async function submitTask(req, res) {

    try {

        const userId = req.user.id;
        const attemptId = Number(req.params.id);

        if (!Number.isInteger(attemptId)) {
            return res.status(400).json({
                message: "Invalid attempt ID."
            });
        }

        const result = await db.query(
            `
            UPDATE task_attempts
            SET
                status = 'submitted',
                completed_at = NOW()
            WHERE id = $1
            AND user_id = $2
            AND status = 'started'
            RETURNING
                id,
                user_id,
                task_id,
                status,
                started_at,
                completed_at
            `,
            [attemptId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Active task attempt not found."
            });
        }

        res.json({
            message: "Task submitted for verification.",
            attempt: result.rows[0]
        });

    } catch (error) {

        console.error("SUBMIT TASK ERROR:", error);

        res.status(500).json({
            message: "Failed to submit task."
        });

    }
}


module.exports = {
    getTasks,
    startTask,
    submitTask
};
