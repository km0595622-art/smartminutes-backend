const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");

const app = express();

// Enable CORS
app.use(cors());

// Parse JSON requests
app.use(express.json());

// Test route
app.get("/", (req, res) => {
  res.json({
    message: "SmartMinute Backend is Running!"
  });
});

// Auth routes
app.use("/api/auth", authRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});