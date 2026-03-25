const Bet = require('../../model/bet/bet.js'); // Assuming this is your Mongoose model for bets
// Add this alongside your VSO settlement functions
const bustAviatorBets = async (roundId) => {
    try {
        // Find ALL bets for this round that are still "pending" (meaning the user never clicked cashout)
        const bustedBets = await Bet.find({
            eventName: roundId,
            marketType: 'aviator_crash',
            status: 'pending'
        });

        if (bustedBets.length === 0) return;

        console.log(`💥 Aviator Crashed! Sweeping ${bustedBets.length} lost bets.`);

        // Mark them all as lost. No ledger update needed because the money was deducted when they placed the bet!
        await Bet.updateMany(
            { eventName: roundId, marketType: 'aviator_crash', status: 'pending' },
            { $set: { status: 'lost', payout: 0, settledAt: new Date() } }
        );
    } catch (err) {
        console.error("Error busting Aviator bets:", err);
    }
};

// Don't forget to export it at the bottom!
module.exports = { bustAviatorBets };