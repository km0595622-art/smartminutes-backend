const express = require("express");
const cors = require("cors");
const db = require("./config/db");

const authRoutes = require("./routes/auth");
const depositRoutes = require("./routes/deposit");

const app = express();


// Middleware
app.use(cors());
app.use(express.json());


// Home
app.get("/", (req, res) => {
    res.json({
        message: "SmartMinute Backend is Running!"
    });
});


// Database test
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


// Authentication routes
app.use("/api/auth", authRoutes);


// Deposit routes
app.use("/api", depositRoutes);


// Start server
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {

    console.log(`Server running on port ${PORT}`);

});