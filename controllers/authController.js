const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const db = require("../config/db");


// ============================================
// REGISTER USER + CREATE WALLET
// ============================================

exports.register = async (req, res) => {
  const client = await db.connect();

  try {
    const { name, email, password } = req.body;

    // Basic validation
    if (!name || !email || !password) {
      client.release();

      return res.status(400).json({
        message: "Name, email and password are required"
      });
    }

    // Check whether email already exists
    const existing = await User.findUserByEmail(email);

    if (existing) {
      client.release();

      return res.status(400).json({
        message: "Email already exists"
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Start transaction
    await client.query("BEGIN");

    // Create user
    const userResult = await client.query(
      `
      INSERT INTO users
      (
        name,
        email,
        password
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        name,
        email,
        trading_unlocked,
        unlock_fee_paid,
        unlock_paid_at;
      `,
      [
        name,
        email,
        hashedPassword
      ]
    );

    const user = userResult.rows[0];

    // Create wallet
    await client.query(
      `
      INSERT INTO wallets
      (
        user_id,
        currency,
        balance,
        withdrawable_balance,
        locked_balance
      )
      VALUES ($1, 'KES', 0.00, 0.00, 0.00);
      `,
      [user.id]
    );

    // Everything succeeded
    await client.query("COMMIT");

    client.release();

    return res.status(201).json({
      message: "Account created successfully",
      user
    });

  } catch (err) {

    // Roll back if anything failed
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("ROLLBACK ERROR:", rollbackError);
    }

    client.release();

    console.error("REGISTER ERROR:", err);

    return res.status(500).json({
      message: "Server error"
    });
  }
};


// ============================================
// LOGIN
// ============================================

exports.login = async (req, res) => {
  try {

    const { email, password } = req.body;

    const user = await User.findUserByEmail(email);

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email
      },
      process.env.JWT_KEY,
      {
        expiresIn: "7d"
      }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });

  } catch (err) {

    console.error("LOGIN ERROR:", err);

    res.status(500).json({
      message: "Server error"
    });
  }
};
