const express = require("express");

const {
    getTasks,
    startTask,
    submitTask
} = require("../controllers/taskController");

const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();


// Get available tasks
router.get(
    "/tasks",
    authenticateToken,
    getTasks
);


// Start a task
router.post(
    "/tasks/:id/start",
    authenticateToken,
    startTask
);


// Submit a task
router.post(
    "/tasks/attempt/:id/submit",
    authenticateToken,
    submitTask
);


module.exports = router;
