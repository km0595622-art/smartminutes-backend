require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./config/db");

const authRoutes = require("./routes/auth");
const depositRoutes = require("./routes/deposit");
const taskRoutes = require("./routes/tasks");
const walletRoutes = require("./routes/wallet");
const paymentWebhookRoutes = require("./routes/paymentWebhook");
const withdrawalRoutes = require("./routes/withdrawal");
const adminRoutes = require("./routes/admin");
const adminKycRoutes = require("./routes/adminKyc");
const kycRoutes = require("./routes/kyc");

const app = express();


// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());
app.use(express.json());


// ============================================
// SERVE WEBSITE FILES
// ============================================

app.use(express.static(path.join(__dirname, "public")));


// ============================================
// HOME
// ============================================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});


// ============================================
// DATABASE TEST
// ============================================

app.get("/test-db", async (req, res) => {

    try {

        const result = await db.query("SELECT NOW()");

        res.json({
            message: "Database connection successful",
            time: result.rows[0].now
        });

    } catch (error) {

        console.error("DATABASE TEST ERROR:", error);

        res.status(500).json({
            message: "Database connection failed",
            error: error.message
        });

    }

});


// ============================================
// AUTHENTICATION
// ============================================

app.use("/api/auth", authRoutes);


// ============================================
// DEPOSITS
// ============================================

app.use("/api", depositRoutes);


// ============================================
// TASKS
// ============================================

app.use("/api", taskRoutes);


// ============================================
// WALLET
// ============================================

app.use("/api/wallet", walletRoutes);
app.use("/api", paymentWebhookRoutes);

// ============================================
// WITHDRAWALS
// ============================================

app.use("/api", withdrawalRoutes);

// ============================================
// ADMIN
// ============================================

app.use("/api/admin", adminRoutes);
app.use("/api/admin/kyc", adminKycRoutes);

// ============================================
// KYC
// ============================================

app.use("/api/kyc", kycRoutes);


// ============================================
// 404 HANDLER
// ============================================

app.use((req, res) => {

    res.status(404).json({
        message: "Route not found."
    });

});


// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {

    console.log(
        `SmartMinute server running on port ${PORT}`
    );

});
