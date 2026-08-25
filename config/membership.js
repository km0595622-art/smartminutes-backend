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
        fee: 350,
        rank: 3
    },

    titanium: {
        name: "Titanium",
        fee: 450,
        rank: 4
    },

    platinum: {
        name: "Platinum",
        fee: 600,
        rank: 5
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
