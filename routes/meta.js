const express = require("express");

const router = express.Router();

router.get("/callback", (req, res) => {
    const { code, error, error_description } = req.query;

    if (error) {
        return res.status(400).json({
            message: "Meta authorization was not completed.",
            error,
            error_description
        });
    }

    if (!code) {
        return res.status(400).json({
            message: "Missing Meta authorization code."
        });
    }

    res.json({
        message: "Meta authorization callback received.",
        authorizationCodeReceived: true
    });
});

module.exports = router;
