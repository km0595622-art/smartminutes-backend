const express = require("express");

const {
    createMembershipPayment,
    getMembershipStatus
} = require("../controllers/membershipController");

const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();


// ============================================
// GET CURRENT MEMBERSHIP
// ============================================

router.get(
    "/membership",
    authenticateToken,
    getMembershipStatus
);


// ============================================
// CREATE MEMBERSHIP PAYMENT
// ============================================

router.post(
    "/membership/purchase",
    authenticateToken,
    createMembershipPayment
);


module.exports = router;
