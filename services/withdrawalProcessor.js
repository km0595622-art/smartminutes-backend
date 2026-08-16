const {
    startWithdrawal,
    completeWithdrawal,
    failWithdrawal
} = require("./withdrawalService");

const {
    sendPayout
} = require("./payoutProvider");


// ============================================
// PROCESS WITHDRAWAL
// ============================================

async function processWithdrawal(
    withdrawalId,
    provider = "manual"
) {

    // ============================================
    // START
    // ============================================

    const started = await startWithdrawal(withdrawalId);

    const withdrawal = started.withdrawal;


    try {

        // ============================================
        // SEND PAYOUT
        // ============================================

        const payout = await sendPayout({

            provider,

            withdrawalId: withdrawal.id,

            amount: Number(withdrawal.net_amount),

            currency: withdrawal.currency,

            method: withdrawal.method,

            destination: withdrawal.destination

        });


        // ============================================
        // PROVIDER REJECTED PAYOUT
        // ============================================

        if (!payout || !payout.success) {

            const reason =
                payout?.message ||
                "Payout provider rejected the withdrawal.";

            return await failWithdrawal(
                withdrawalId,
                reason
            );

        }


        // ============================================
        // COMPLETE INTERNAL WITHDRAWAL
        // ============================================

        const completed =
            await completeWithdrawal(
                withdrawalId,
                payout.providerTransactionId
            );


        return {

            success: true,

            message:
                "Withdrawal processed successfully.",

            provider: payout.provider,

            providerTransactionId:
                payout.providerTransactionId,

            withdrawal:
                completed.withdrawal,

            wallet:
                completed.wallet

        };


    } catch (error) {

        // ============================================
        // PROVIDER ERROR
        // ============================================

        try {

            await failWithdrawal(
                withdrawalId,
                error.message || "Payout provider error."
            );

        } catch (failureError) {

            console.error(
                "WITHDRAWAL FAILURE RECOVERY ERROR:",
                failureError
            );

        }

        throw error;

    }

}


module.exports = {
    processWithdrawal
};
