const express = require("express");

const kycController =
    require("../controllers/kycController");

const authenticateToken =
    require("../middleware/authMiddleware");

const router = express.Router();


// ============================================
// GET MY KYC
// ============================================

router.get(
    "/",
    authenticateToken,
    kycController.getMyKyc
);


// ============================================
// START KYC
// ============================================

router.post(
    "/start",
    authenticateToken,
    kycController.startKyc
);


// ============================================
// SUBMIT KYC
// ============================================

router.post(
    "/submit",
    authenticateToken,
    kycController.submitKyc
);


module.exports = router;
