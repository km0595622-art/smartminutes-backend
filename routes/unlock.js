const express = require("express");

const {
    createUnlockPayment,
    getUnlockStatus
} = require("../controllers/unlockController");

const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();


// ============================================
// GET TRADING UNLOCK STATUS
// ============================================

router.get(
    "/unlock/status",
    authenticateToken,
    getUnlockStatus
);


// ============================================
// CREATE TRADING UNLOCK PAYMENT
// ============================================

router.post(
    "/unlock/purchase",
    authenticateToken,
    createUnlockPayment
);


module.exports = router;
