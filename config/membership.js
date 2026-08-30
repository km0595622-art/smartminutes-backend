const MEMBERSHIP_TIERS = {
    free: {
        name: "Free",
        fee: 0,
        rank: 0
    },

    bronze: {
        name: "Bronze",
        fee: 150,
        rank: 1
    },

    silver: {
        name: "Silver",
        fee: 250,
        rank: 2
    },

    gold: {
        name: "Gold",
        fee: 500,
        rank: 3
    },

    diamond: {
        name: "Diamond",
        fee: 750,
        rank: 4
    },

    titanium: {
        name: "Titanium",
        fee: 1000,
        rank: 5
    },

    platinum: {
        name: "Platinum",
        fee: 1500,
        rank: 6
    }
};

function getMembershipTier(tier) {
    return MEMBERSHIP_TIERS[tier] || MEMBERSHIP_TIERS.free;
}

function hasMembershipAccess(userTier, requiredTier) {
    const user = getMembershipTier(userTier);
    const required = getMembershipTier(requiredTier);

    return user.rank >= required.rank;
}

module.exports = {
    MEMBERSHIP_TIERS,
    getMembershipTier,
    hasMembershipAccess
};
