const express = require("express");

const withdrawalController =
    require("../controllers/withdrawalController");

const authenticateToken =
    require("../middleware/authMiddleware");

const router = express.Router();


// ============================================
// CREATE WITHDRAWAL REQUEST
// ============================================

router.post(
    "/",
    authenticateToken,
    withdrawalController.createWithdrawal
);


module.exports = router;
