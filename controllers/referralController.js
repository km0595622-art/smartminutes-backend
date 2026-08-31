const pool = require("../config/db");


// ============================================
// GET USER REFERRAL INFORMATION
// ============================================

async function getReferralInfo(req, res){

    try{

        const userId =
            req.user.id;


        // Get user's referral code

        const userResult =
            await pool.query(
                `
                SELECT
                    id,
                    referral_code
                FROM users
                WHERE id = $1
                `,
                [userId]
            );


        if(userResult.rows.length === 0){

            return res.status(404).json({
                success:false,
                message:"User not found."
            });

        }


        const user =
            userResult.rows[0];


        // Get referrals belonging to this user

        const referralResult =
            await pool.query(
                `
                SELECT
                    id,
                    referred_user_id,
                    referral_code,
                    status,
                    created_at
                FROM referrals
                WHERE referrer_id = $1
                ORDER BY created_at DESC
                `,
                [userId]
            );


        const referrals =
            referralResult.rows;


        const totalReferrals =
            referrals.filter(
                referral =>
                    String(referral.status || "")
                        .toLowerCase() === "completed"
            ).length;


        // ========================================
        // FREE TASK
        // Requirement: at least 5 referrals
        // ========================================

        const freeRequired =
            5;

        const freeProgress =
            Math.min(
                totalReferrals,
                freeRequired
            );

        const freeCompleted =
            totalReferrals >= freeRequired;


        // ========================================
        // BRONZE
        // Existing requirement: 100 referrals
        // ========================================

        const bronzeRequired =
            100;

        const bronzeProgress =
            Math.min(
                totalReferrals,
                bronzeRequired
            );

        const bronzeCompleted =
            totalReferrals >= bronzeRequired;


        const referralLink =
            user.referral_code
                ? `${req.protocol}://${req.get("host")}/register.html?ref=${encodeURIComponent(user.referral_code)}`
                : "";


        return res.json({

            success:true,

            referral:{
                referralCode:
                    user.referral_code || "",

                referralLink,

                total:
                    totalReferrals,

                free:{
                    required:
                        freeRequired,

                    progress:
                        freeProgress,

                    completed:
                        freeCompleted
                },

                bronze:{
                    required:
                        bronzeRequired,

                    progress:
                        bronzeProgress,

                    completed:
                        bronzeCompleted
                },

                history:
                    referrals

            }

        });

    }catch(error){

        console.error(
            "GET REFERRAL INFO ERROR:",
            error
        );

        return res.status(500).json({
            success:false,
            message:"Unable to load referral information."
        });

    }

}


module.exports = {
    getReferralInfo
};
