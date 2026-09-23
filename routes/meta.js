const express = require("express");
const crypto = require("crypto");

const router = express.Router();

const META_APP_ID = process.env.META_APP_ID;
const META_CONFIG_ID = process.env.META_CONFIG_ID;
const META_REDIRECT_URI =
    "https://smartminutes-backend.onrender.com/api/meta/callback";

router.get("/login", (req, res) => {
    if (!META_APP_ID) {
        return res.status(500).json({
            message: "META_APP_ID is not configured."
        });
    }

    if (!META_CONFIG_ID) {
        return res.status(500).json({
            message: "META_CONFIG_ID is not configured."
        });
    }

    const state = crypto.randomBytes(32).toString("hex");

    const params = new URLSearchParams({
        client_id: META_APP_ID,
        redirect_uri: META_REDIRECT_URI,
        config_id: META_CONFIG_ID,
        state
    });

    res.redirect(
        `https://www.facebook.com/v24.0/dialog/oauth?${params.toString()}`
    );
});

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
