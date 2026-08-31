const express = require("express");

const {
    getReferralInfo
} = require("../controllers/referralController");

const authenticateToken =
    require("../middleware/authMiddleware");

const router =
    express.Router();


// ============================================
// GET REFERRAL INFORMATION
// ============================================

router.get(
    "/referrals",
    authenticateToken,
    getReferralInfo
);


module.exports = router;
