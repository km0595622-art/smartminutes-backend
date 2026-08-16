/**
 * SmartMinute Payout Provider
 *
 * This layer separates withdrawal accounting
 * from the external payment provider.
 *
 * CURRENT:
 * manual provider = TEST ONLY
 *
 * FUTURE:
 * mpesa
 * other African providers
 * international payout providers
 *
 * IMPORTANT:
 * This file does NOT send real money yet.
 */

const crypto = require("crypto");


// ============================================
// MANUAL TEST PROVIDER
// ============================================

async function manualPayout({
    withdrawalId,
    amount,
    currency,
    method,
    destination
}) {

    console.log("=================================");
    console.log("MANUAL PAYOUT PROVIDER");
    console.log("=================================");

    console.log({
        withdrawalId,
        amount,
        currency,
        method,
        destination
    });

    // TEST ONLY.
    // No real money is sent.

    const providerTransactionId =
        `MANUAL-TEST-${withdrawalId}-${crypto.randomBytes(6).toString("hex")}`;

    return {
        success: true,
        provider: "manual",
        providerTransactionId,
        message: "Manual test payout accepted. No real money was sent."
    };
}


// ============================================
// MAIN PAYOUT FUNCTION
// ============================================

async function sendPayout({
    provider = "manual",
    withdrawalId,
    amount,
    currency,
    method,
    destination
}) {

    switch (provider) {

        case "manual":

            return manualPayout({
                withdrawalId,
                amount,
                currency,
                method,
                destination
            });


        case "mpesa":

            throw new Error(
                "M-Pesa payout provider is not connected yet."
            );


        default:

            throw new Error(
                `Unsupported payout provider: ${provider}`
            );

    }

}


module.exports = {
    sendPayout
};
