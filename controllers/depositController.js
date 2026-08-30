const pool = require("../config/db");
const { stkPush } = require("../services/mpesaService");

// Create a new deposit and initiate M-Pesa STK Push
const createDeposit = async (req, res) => {
  try {
    // Authenticated user's ID
    const user_id = req.user.id;

    const { amount, phone } = req.body;

    // Validate required fields
    if (!amount || !phone) {
      return res.status(400).json({
        success: false,
        message: "amount and phone are required"
      });
    }

    const depositAmount = Number(amount);

    // Validate amount
    if (!Number.isFinite(depositAmount)) {
      return res.status(400).json({
        success: false,
        message: "Invalid deposit amount"
      });
    }

    // Minimum SmartMinute deposit
    if (depositAmount < 50) {
      return res.status(400).json({
        success: false,
        message: "Minimum deposit amount is KSh 50"
      });
    }

    // Basic Kenyan phone validation
    const normalizedPhone = String(phone)
      .replace(/\s+/g, "")
      .replace(/^\+/, "");

    if (!/^2547\d{8}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid Kenyan M-Pesa number, e.g. 2547XXXXXXXX"
      });
    }

    /*
    ============================================
    CREATE PENDING DEPOSIT
    ============================================
    */

    const result = await pool.query(
      `
      INSERT INTO deposits
        (user_id, amount, phone, status)
      VALUES
        ($1, $2, $3, 'pending')
      RETURNING
        id,
        user_id,
        amount,
        phone,
        status,
        transaction_id,
        checkout_request_id,
        created_at
      `,
      [
        user_id,
        depositAmount,
        normalizedPhone
      ]
    );

    const deposit = result.rows[0];

    /*
    ============================================
    INITIATE DARAJA STK PUSH
    ============================================
    */

    let stkResponse;

    try {
      stkResponse = await stkPush({
        amount: depositAmount,
        phone: normalizedPhone,
        accountReference: `SM${deposit.id}`,
        transactionDesc: `SmartMinute Deposit ${deposit.id}`
      });
    } catch (stkError) {
      console.error(
        "DARAJA STK PUSH ERROR:",
        stkError.message
      );

      // Keep the deposit record, but mark the request as failed.
      await pool.query(
        `
        UPDATE deposits
        SET status = 'failed'
        WHERE id = $1
        `,
        [deposit.id]
      );

      return res.status(502).json({
        success: false,
        message: "Unable to initiate M-Pesa payment.",
        deposit_id: deposit.id
      });
    }

    /*
    ============================================
    SAVE CHECKOUT REQUEST ID
    ============================================
    */

    if (stkResponse.CheckoutRequestID) {
      await pool.query(
        `
        UPDATE deposits
        SET checkout_request_id = $1
        WHERE id = $2
        `,
        [
          stkResponse.CheckoutRequestID,
          deposit.id
        ]
      );
    }

    /*
    ============================================
    RESPONSE
    ============================================
    */

    return res.status(201).json({
      success: true,
      message:
        stkResponse.ResponseDescription ||
        "STK Push sent. Check your phone and enter your M-Pesa PIN.",
      deposit_id: deposit.id,
      checkout_request_id:
        stkResponse.CheckoutRequestID || null,
      merchant_request_id:
        stkResponse.MerchantRequestID || null,
      response_code:
        stkResponse.ResponseCode || null,
      customer_message:
        stkResponse.CustomerMessage || null
    });

  } catch (error) {
    console.error(
      "CREATE DEPOSIT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Server error while creating deposit"
    });
  }
};

module.exports = {
  createDeposit
};
