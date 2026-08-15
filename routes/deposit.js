const express = require("express");
const router = express.Router();

const depositController = require("../controllers/depositController");
const authenticateToken = require("../middleware/authMiddleware");

router.post(
  "/deposit",
  authenticateToken,
  depositController.createDeposit
);

module.exports = router;
