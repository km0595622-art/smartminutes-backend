const express = require("express");
const depositModel = require("../models/depositModel");

const router = express.Router();

/*
============================================
PAYMENT PROVIDER WEBHOOK
============================================

The payment provider will eventually send
a notification here when a payment succeeds.

IMPORTANT:
Do not expose secret keys or provider
credentials in this file.
*/

router.post("/payment/webhook", async (req, res) => {

    try {

        const {
            deposit_id,
            transaction_id,
            status
        } = req.body;


        // Basic validation

        if (!deposit_id || !transaction_id || !status) {

            return res.status(400).json({
                message: "Missing payment information."
            });

        }


        // We only credit successful payments.

        if (
            status !== "success" &&
            status !== "successful" &&
            status !== "completed"
        ) {

            return res.status(200).json({
                message: "Payment not successful. No wallet change."
            });

        }


        const result =
            await depositModel.confirmDeposit(
                deposit_id,
                transaction_id
            );


        return res.status(200).json({
            message: result.alreadyProcessed
                ? "Payment already processed."
                : "Payment confirmed and wallet credited."
        });


    } catch (error) {

        console.error(
            "PAYMENT WEBHOOK ERROR:",
            error
        );

        return res.status(500).json({
            message: "Unable to process payment notification."
        });

    }

});


module.exports = router;
