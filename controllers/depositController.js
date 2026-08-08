const depositModel = require("../models/depositModel");

async function createDeposit(req, res) {
    try {

        const { userId, amount, phone } = req.body;

        // Check required information
        if (!userId || !amount || !phone) {
            return res.status(400).json({
                message: "User ID, amount and phone number are required."
            });
        }

        // Convert amount to number
        const depositAmount = Number(amount);

        // Minimum deposit is KSh 99
        if (depositAmount < 99) {
            return res.status(400).json({
                message: "Minimum deposit is KSh 99."
            });
        }

        // Basic M-Pesa phone validation
        if (!/^07\d{8}$/.test(phone)) {
            return res.status(400).json({
                message: "Please enter a valid M-Pesa phone number."
            });
        }

        const deposit = await depositModel.createDeposit(
            userId,
            depositAmount,
            phone
        );

        res.status(201).json({
            message: "Deposit request created successfully.",
            deposit: deposit
        });

    } catch (error) {

        console.error("CREATE DEPOSIT ERROR:", error);

        res.status(500).json({
            message: "Failed to create deposit request.",
            error: error.message
        });
    }
}


async function getDeposit(req, res) {
    try {

        const { id } = req.params;

        const deposit = await depositModel.findDepositById(id);

        if (!deposit) {
            return res.status(404).json({
                message: "Deposit not found."
            });
        }

        res.json({
            deposit: deposit
        });

    } catch (error) {

        console.error("GET DEPOSIT ERROR:", error);

        res.status(500).json({
            message: "Failed to get deposit.",
            error: error.message
        });
    }
}


module.exports = {
    createDeposit,
    getDeposit
};