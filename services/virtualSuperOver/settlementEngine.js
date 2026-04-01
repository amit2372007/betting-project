const Bet = require('../../model/bet/bet.js'); // Adjust paths to your models
const User = require('../../model/user/user.js');
const Ledger = require('../../model/user/ledger.js');

/**
 * 1. Settles all pending micro-bets for the current ball.
 * @param {String} eventId - The unique ID of the virtual match (e.g., "VSO-123456")
 * @param {Object} result - The outcome object { outcome: '6', runs: 6, legal: true }
 */
const settleNextBallBets = async (eventId, result) => {
    try {
        const pendingBets = await Bet.find({
            eventName: eventId,
            marketType: 'vso_next_ball',
            status: 'pending'
        });

        if (pendingBets.length === 0) return;

       
        await Promise.all(pendingBets.map(async (bet) => {
            let isWinner = false;
            const selection = bet.selection.toLowerCase();

            // --- WINNING LOGIC EVALUATION ---
            if (selection === result.outcome.toLowerCase()) {
                isWinner = true;
            } 
            else if (selection === 'boundary_yes' && ['4', '6'].includes(result.outcome)) {
                isWinner = true;
            } 
            else if (selection === 'boundary_no' && !['4', '6'].includes(result.outcome)) {
                isWinner = true;
            }
            else if (['0', '1', '2', '3', '4', '6'].includes(result.outcome)) {
                const isEven = result.runs % 2 === 0;
                if (selection === 'even' && isEven) isWinner = true;
                if (selection === 'odd' && !isEven) isWinner = true;
            }

            // --- PAYOUT EXECUTION ---
            if (isWinner) {
                const payout = bet.stake + bet.potentialWin;

                bet.status = 'won';
                bet.payout = payout;
                bet.settledAt = new Date();
                await bet.save();

                const userBefore = await User.findByIdAndUpdate(
                    bet.userId,
                    { $inc: { balance: payout } },
                    { new: false }
                );

                if (userBefore) {
                    await Ledger.create({
                        userId: bet.userId,
                        type: 'bet_won',
                        amount: payout,
                        balanceBefore: userBefore.balance,
                        balanceAfter: userBefore.balance + payout,
                        betId: bet._id,
                        remarks: `VSO Won: ${bet.selection.toUpperCase()} (Rolled ${result.outcome})`
                    });
                }
            } else {
                bet.status = 'lost';
                bet.payout = 0;
                bet.settledAt = new Date();
                await bet.save();
            }
        }));

    } catch (error) {
        console.error("CRITICAL ERROR in Next Ball Settlement:", error);
    }
};

/**
 * 2. Settles all Match Winner bets at the end of the game.
 * @param {String} eventId - The unique ID of the virtual match
 * @param {String} finalWinnerSide - 'home', 'away', or 'tie'
 */
const settleMatchWinnerBets = async (eventId, finalWinnerSide) => {
    try {
        const pendingBets = await Bet.find({
            eventName: eventId,
            marketType: "vso_match_winner",
            status: "pending"
        });

        if (pendingBets.length === 0) return;

       

        // Map the backend winner ('home'/'away') to the frontend selection string
        let winningSelection = null;
        if (finalWinnerSide === 'home') winningSelection = 'IND_WIN';
        if (finalWinnerSide === 'away') winningSelection = 'PAK_WIN';

        await Promise.all(pendingBets.map(async (bet) => {
            
            // --- TIE / VOID LOGIC ---
            if (finalWinnerSide === 'tie') {
                bet.status = "void";
                bet.payout = bet.stake;
                bet.settledAt = new Date();
                await bet.save();

                const userBefore = await User.findByIdAndUpdate(
                    bet.userId,
                    { $inc: { balance: bet.stake } },
                    { new: false }
                );

                if (userBefore) {
                    await Ledger.create({
                        userId: bet.userId,
                        type: "bet_refund",
                        amount: bet.stake,
                        balanceBefore: userBefore.balance,
                        balanceAfter: userBefore.balance + bet.stake,
                        betId: bet._id,
                        remarks: `VSO Match Tied - Stake Refunded`
                    });
                }
            } 
            // --- WIN LOGIC ---
            else if (bet.selection === winningSelection) {
                const payout = bet.stake + bet.potentialWin;
                
                bet.status = "won";
                bet.payout = payout;
                bet.settledAt = new Date();
                await bet.save();

                const userBefore = await User.findByIdAndUpdate(
                    bet.userId,
                    { $inc: { balance: payout } },
                    { new: false }
                );

                if (userBefore) {
                    await Ledger.create({
                        userId: bet.userId,
                        type: "bet_won",
                        amount: payout,
                        balanceBefore: userBefore.balance,
                        balanceAfter: userBefore.balance + payout,
                        betId: bet._id,
                        remarks: `Won VSO Match: ${bet.selection.replace('_WIN', '')}`
                    });
                }
            } 
            // --- LOSS LOGIC ---
            else {
                bet.status = "lost";
                bet.payout = 0;
                bet.settledAt = new Date();
                await bet.save();
            }
        }));

    } catch (err) {
        console.error(`CRITICAL ERROR settling match winner bets for ${eventId}:`, err);
    }
};

// Export both functions so the Engine can use them
module.exports = {
    settleNextBallBets,
    settleMatchWinnerBets
};