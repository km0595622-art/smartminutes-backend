const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {

    try {

        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                message: "Authentication required."
            });
        }

        const parts = authHeader.split(" ");

        if (
            parts.length !== 2 ||
            parts[0] !== "Bearer" ||
            !parts[1]
        ) {
            return res.status(401).json({
                message: "Invalid authorization format."
            });
        }

        const token = parts[1];

        // SmartMinute uses JWT_KEY
        const decoded = jwt.verify(
            token,
            process.env.JWT_KEY
        );

        req.user = decoded;

        next();

    } catch (error) {

        console.error(
            "AUTHENTICATION ERROR:",
            error.message
        );

        return res.status(401).json({
            message: "Invalid or expired token."
        });

    }

}

module.exports = authenticateToken;

