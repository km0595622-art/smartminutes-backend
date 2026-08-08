const express = require("express");

const {
    createDeposit,
    getDeposit
} = require("../controllers/depositController");

const router = express.Router();


// Create a deposit
router.post("/deposit", createDeposit);


// Get a deposit
router.get("/deposit/:id", getDeposit);


module.exports = router;