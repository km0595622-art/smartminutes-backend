const express = require("express");
const depositModel = require("../models/depositModel");

const router = express.Router();

/*
================================================
SAFARICOM DARAJA STK CALLBACK
================================================

Safaricom sends the STK Push result to this
endpoint after the customer completes or
cancels the payment.

Wallet credit happens ONLY when ResultCode = 0.
*/

router.post("/payment/webhook", async (req, res) => {
  try {
    console.log(
      "DARAJA CALLBACK:",
      JSON.stringify(req.body)
    );

    const stkCallback =
      req.body?.Body?.stkCallback;

    if (!stkCallback) {
      console.error(
        "Invalid Daraja callback: stkCallback missing"
      );

      return res.status(200).json({
        ResultCode: 0,
        ResultDesc: "Callback received"
      });
    }

    const {
      ResultCode,
      ResultDesc,
      CheckoutRequestID,
      CallbackMetadata
    } = stkCallback;

    /*
    ============================================
    PAYMENT FAILED / CANCELLED
    ============================================
    */

    if (Number(ResultCode) !== 0) {
      console.log(
        "DARAJA PAYMENT NOT SUCCESSFUL:",
        ResultCode,
        ResultDesc
      );

      return res.status(200).json({
        ResultCode: 0,
        ResultDesc: "Callback processed"
      });
    }

    /*
    ============================================
    SUCCESSFUL PAYMENT
    ============================================
    */

    if (!CheckoutRequestID) {
      console.error(
        "Successful Daraja callback has no CheckoutRequestID"
      );

      return res.status(200).json({
        ResultCode: 0,
        ResultDesc: "Callback received"
      });
    }

    /*
    ============================================
    FIND DEPOSIT
    ============================================
    */

    const deposit =
      await depositModel.findDepositByCheckoutRequestId(
        CheckoutRequestID
      );

    if (!deposit) {
      console.error(
        "No SmartMinute deposit found for CheckoutRequestID:",
        CheckoutRequestID
      );

      return res.status(200).json({
        ResultCode: 0,
        ResultDesc: "Callback received"
      });
    }

    /*
    ============================================
    EXTRACT MPESA RECEIPT
    ============================================
    */

    let mpesaReceipt = null;

    const items =
      CallbackMetadata?.Item || [];

    for (const item of items) {
      if (
        item.Name === "MpesaReceiptNumber"
      ) {
        mpesaReceipt = item.Value;
        break;
      }
    }

    if (!mpesaReceipt) {
      console.error(
        "Successful payment has no M-Pesa receipt."
      );

      return res.status(200).json({
        ResultCode: 0,
        ResultDesc: "Callback received"
      });
    }

    /*
    ============================================
    CONFIRM + CREDIT WALLET
    ============================================
    */

    const result =
      await depositModel.confirmDeposit(
        deposit.id,
        String(mpesaReceipt)
      );

    console.log(
      result.alreadyProcessed
        ? "Deposit already processed."
        : "Deposit confirmed and wallet credited."
    );

    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: "Callback processed successfully"
    });

  } catch (error) {
    console.error(
      "DARAJA CALLBACK ERROR:",
      error
    );

    /*
    Safaricom expects a response from the callback.
    Do not expose internal errors.
    */

    return res.status(200).json({
      ResultCode: 0,
      ResultDesc: "Callback received"
    });
  }
});


module.exports = router;
