const pool = require("../config/db");

// Create a new deposit
const createDeposit = async (req, res) => {
  try {
    // Get authenticated user's ID from the JWT
    const user_id = req.user.id;

    const { amount, phone } = req.body;

    // Validate required fields
    if (!amount || !phone) {
      return res.status(400).json({
        success: false,
        message: "amount and phone are required"
      });
    }

    // Minimum SmartMinute deposit
    if (Number(amount) < 50) {
      return res.status(400).json({
        success: false,
        message: "Minimum deposit amount is KSh 50"
      });
    }

    // Save deposit as pending
    const result = await pool.query(
      `
      INSERT INTO deposits
        (user_id, amount, phone, status)
      VALUES
        ($1, $2, $3, 'pending')
      RETURNING *
      `,
      [user_id, amount, phone]
    );

    return res.status(201).json({
      success: true,
      message: "Deposit request created successfully",
      transaction: result.rows[0]
    });

  } catch (error) {
    console.error("CREATE DEPOSIT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server error while creating deposit"
    });
  }
};

module.exports = {
  createDeposit
};
