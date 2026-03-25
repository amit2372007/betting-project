const User = require("../model/user/user");
const Event = require("../model/event/event.js");
const Bet = require("../model/bet/bet.js");
const Transaction = require("../model/transactions/transaction.js");
const Session = require("../model/event/session.js");
const Ledger = require("../model/user/ledger.js");
const Complaint = require("../model/complain/complain.js");
const VirtualSuperOver = require("../model/virtualSuperOver/VirtualSuperOver.js");
const AviatorRound = require("../model/aviator/aviator.js");
const SevenUpBet = require("../model/7up7Down/7up7down.js");
const FruitBonanzaBet = require("../model/fruitBonanza/fruitBonanza.js");


const REEL_STRIP = [
    '🍒','🍒','🍒','🍒','🍒', // Cherry (Very Common)
    '🍋','🍋','🍋','🍋',      // Lemon (Common)
    '🍉','🍉','🍉',           // Watermelon (Medium)
    '🍇','🍇','🍇',           // Grapes (Medium)
    '🔔','🔔',                // Bell (Rare)
    '💎',                     // Diamond (Very Rare)
    '7️⃣'                      // Seven (Jackpot Rare)
];

// Multipliers for hitting 3-of-a-kind on the payline
const PAYOUTS = {
    '🍒': 2.0,   // 2x Bet
    '🍋': 3.0,   // 3x Bet
    '🍉': 5.0,   // 5x Bet
    '🍇': 10.0,  // 10x Bet
    '🔔': 25.0,  // 25x Bet
    '💎': 50.0,  // 50x Bet
    '7️⃣': 150.0  // 150x Jackpot!
};

// Define your fixed multipliers
const PAYOUT_MULTIPLIERS = {
    '7_down': 2.00,
    '7_exact': 5.00,
    '7_up': 2.00,
    'sum_2': 30.0,
    'sum_3': 15.0,
    'sum_4': 10.0,
    'sum_5': 7.5,
    'sum_6': 6.0,
    'sum_7': 5.0,
    'sum_8': 6.0,
    'sum_9': 7.5,
    'sum_10': 10.0,
    'sum_11': 15.0,
    'sum_12': 30.0
};

const validSelections = [
    '7_down', '7_exact', '7_up', 
    'sum_2', 'sum_3', 'sum_4', 'sum_5', 'sum_6', 'sum_7', 
    'sum_8', 'sum_9', 'sum_10', 'sum_11', 'sum_12'
];


// Game Routes (e.g., in routes/game.js)
const HOUSE_EDGE = 0.97; // 3% House Edge


// Helper Function: Combinations nCr
function combinations(n, r) {
  if (r > n) return 0;
  if (r === 0 || r === n) return 1;
  let res = 1;
  for (let i = 1; i <= r; i++) {
    res = (res * (n - i + 1)) / i;
  }
  return res;
}

module.exports.slotsSpin = async (req, res) => {
    try {
      
        const { stake } = req.body;
        const userId = req.user._id;

        // 1. Basic Security Validation
        if (!stake || stake < 10) {
            return res.status(400).json({ success: false, error: 'Minimum bet is ₹10.' });
        }

        // 2. 🔥 ATOMIC DEDUCTION (Fixes the Double-Spend Exploit)
        // This finds the user ONLY if they have enough balance, and deducts the stake instantly in one database move.
        let user = await User.findOneAndUpdate(
            { _id: userId, balance: { $gte: stake } },
            { $inc: { balance: -stake } },
            { new: true }
        );

        if (!user) {
            return res.status(400).json({ success: false, error: 'Insufficient balance or user not found.' });
        }

        // 3. --- RNG LOGIC ---
        const r1 = REEL_STRIP[Math.floor(Math.random() * REEL_STRIP.length)];
        const r2 = REEL_STRIP[Math.floor(Math.random() * REEL_STRIP.length)];
        const r3 = REEL_STRIP[Math.floor(Math.random() * REEL_STRIP.length)];

        // 4. Evaluate Win (Fixes the RTP by rewarding 2-of-a-kind left-to-right)
        let isWin = false;
        let multiplier = 0;
        let payout = 0;

        if (r1 === r2 && r2 === r3) {
            // Jackpot! All 3 match
            isWin = true;
            multiplier = PAYOUTS[r1];
        } else if (r1 === r2) {
            // Small win! First 2 match. This keeps players engaged and balances your RTP.
            isWin = true;
            // Pay back 40% of the standard 3-match value, ensuring they at least get their money back (1x)
            multiplier = Math.max(1.0, PAYOUTS[r1] * 0.4); 
        }

        // 5. Calculate Payout & Atomically Update Wallet
        if (isWin) {
            payout = stake * multiplier;
            
            user = await User.findByIdAndUpdate(
                userId, 
                { $inc: { balance: payout } },
                { new: true }
            );
        }

        // 6. Log the bet into MongoDB
        const newBet = await FruitBonanzaBet.create({
            userId: user._id,
            stake,
            reel1: r1,
            reel2: r2,
            reel3: r3,
            status: isWin ? 'won' : 'lost',
            multiplier,
            payout
        });

        // 7. Send results back to frontend
        res.json({
            success: true,
            reel1: r1,
            reel2: r2,
            reel3: r3,
            isWin,
            multiplier,
            payout,
            newBalance: user.balance,
            betId: newBet._id
        });

    } catch (err) {
        console.error("Slots Engine Error:", err);
        res.status(500).json({ success: false, error: "Server error during spin." });
    }
}

module.exports.sevenUp7DownRoll = async (req, res) => {
    try {
        // 1. Get bet details from frontend
        const { stake, selection } = req.body;
        const userId = req.user._id; 

        // 2. Strict Security Validations
        if (!stake || stake < 10) {
            return res.status(400).json({ success: false, error: 'Minimum bet is ₹10.' });
        }
        if (!validSelections.includes(selection)) {
            return res.status(400).json({ success: false, error: 'Invalid betting zone.' });
        }

        // 3. Find User & Check Wallet
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
        if (user.balance < stake) {
            return res.status(400).json({ success: false, error: 'Insufficient balance.' });
        }

        // 4. 🔥 DEDUCT STAKE IMMEDIATELY (Prevents double-click exploits)
        user.balance -= stake;

        // --- 🎲 CASINO RNG ENGINE 🎲 ---
        const dice1 = Math.floor(Math.random() * 6) + 1;
        const dice2 = Math.floor(Math.random() * 6) + 1;
        const sum = dice1 + dice2;

        // 5. Evaluate the Win/Loss Condition
        let isWin = false;
        
        if (selection === '7_down' && sum < 7) {
            isWin = true;
        } else if (selection === '7_exact' && sum === 7) {
            isWin = true;
        } else if (selection === '7_up' && sum > 7) {
            isWin = true;
        } else if (selection.startsWith('sum_')) {
            // Extracts the number from the string (e.g., '10' from 'sum_10')
            const chosenNumber = parseInt(selection.split('_')[1]);
            if (sum === chosenNumber) {
                isWin = true;
            }
        }

        // 6. Calculate Payout & Update Wallet
        let payout = 0;
        if (isWin) {
            payout = stake * PAYOUT_MULTIPLIERS[selection];
            user.balance += payout;
        }

        // 7. Save updated balance to Database
        await user.save();

        // 8. Log the bet into MongoDB history
        const newBet = await SevenUpBet.create({
            userId: user._id,
            stake,
            selection,
            dice1,
            dice2,
            sum,
            status: isWin ? 'won' : 'lost',
            payout
        });

        // 9. Send results back to frontend to trigger animations
        res.json({
            success: true,
            dice1,
            dice2,
            sum,
            isWin,
            payout,
            newBalance: user.balance,
            betId: newBet._id
        });

    } catch (err) {
        console.error("7 Up 7 Down Engine Error:", err);
        res.status(500).json({ success: false, error: "Internal server error during dice roll." });
    }
};

module.exports.aviatorPlaceBet = async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ success: false, error: "Unauthorized" });
        
        const { stake } = req.body;
        const numStake = Number(stake);

        const engineState = res.locals.aviatorEngine.state;

        // 1. Validate Phase
        if (engineState.status !== 'starting' || engineState.timer < 1) {
            return res.status(400).json({ success: false, error: "Betting is closed for this round!" });
        }

        if (!numStake || numStake < 10) {
            return res.status(400).json({ success: false, error: "Minimum bet is ₹10." });
        }

        // 2. Deduct Balance Atomically
        const userBefore = await User.findOneAndUpdate(
            { _id: req.user._id, balance: { $gte: numStake } },
            { $inc: { balance: -numStake } },
            { new: false }
        );

        if (!userBefore) return res.status(400).json({ success: false, error: "Insufficient balance!" });

        // 3. Create Pending Bet
        const newBet = await Bet.create({
            userId: req.user._id,
            eventName: engineState.roundId,
            marketType: 'aviator_crash',
            type: 'casino',
            selection: 'cashout', // They are betting that they will click cashout
            stake: numStake,
            status: "pending"
        });

        // 4. Create Ledger Receipt
        await Ledger.create({
            userId: req.user._id,
            type: "bet_placed",
            amount: numStake,
            balanceBefore: userBefore.balance,
            balanceAfter: userBefore.balance - numStake,
            betId: newBet._id,
            remarks: `Aviator Bet Placed (Round: ${engineState.roundId})`
        });

        res.json({ success: true, newBalance: userBefore.balance - numStake });

    } catch (err) {
        console.error("Aviator Bet Error:", err);
        res.status(500).json({ success: false, error: "Server error placing bet" });
    }
};

module.exports.aviatorCashout = async (req, res) => {
    try {

        // 🔥 FIXED: Grab the engine state from res.locals (where your middleware put it!)
        const engineState = res.locals.aviatorEngine.state;

        // 2. Validation: The plane MUST be flying. If it crashed or is starting, reject it.
        if (engineState.status !== 'flying') {
            return res.status(400).json({ success: false, error: "Cannot cash out right now!" });
        }

        // 3. Find their active, pending bet for this exact round
        const activeBet = await Bet.findOne({
            userId: req.user._id,
            eventName: engineState.roundId,
            marketType: 'aviator_crash',
            status: 'pending'
        });

        if (!activeBet) {
            return res.status(400).json({ success: false, error: "No active bet found for this round." });
        }

        // 4. Lock in the payout!
        // (We subtract 0.02 from the exact millisecond multiplier to account for network ping latency)
        const lockedMultiplier = Math.max(1.01, engineState.multiplier - 0.02);
        const payout = activeBet.stake * lockedMultiplier;

        // 5. ATOMIC DB Updates (Mark bet as won & add money to wallet)
        activeBet.status = 'won';
        activeBet.payout = payout;
        activeBet.settledAt = new Date();
        await activeBet.save();

        const userAfter = await User.findByIdAndUpdate(
            req.user._id,
            { $inc: { balance: payout } },
            { new: true }
        );

        // 6. Generate the Ledger Passbook Receipt
        await Ledger.create({
            userId: req.user._id,
            type: "bet_won",
            amount: payout,
            balanceBefore: userAfter.balance - payout,
            balanceAfter: userAfter.balance,
            betId: activeBet._id,
            remarks: `Cashed out Aviator at ${lockedMultiplier.toFixed(2)}x`
        });

        // 7. 📢 MULTIPLAYER BROADCAST (The FOMO Feed)
        // Check if IO is attached to app.locals. If it is, broadcast the win to the whole lobby!
        if (req.app.locals.io) {
            // Mask the username for privacy (e.g., "Amit Kumar" -> "Ami***")
            const maskedName = req.user.username ? req.user.username.slice(0, 3) + '***' : 'Use***';
            
            req.app.locals.io.emit('aviator_cashout_feed', {
                player: maskedName,
                multiplier: lockedMultiplier.toFixed(2),
                amountWon: payout.toFixed(2)
            });
        }

        // 8. Send the massive success response back to the user who clicked the button
        res.json({ 
            success: true, 
            payout: payout, 
            lockedMultiplier: lockedMultiplier.toFixed(2),
            newBalance: userAfter.balance 
        });

    } catch (err) {
        console.error("Aviator Cashout Error:", err);
        res.status(500).json({ success: false, error: "Server error during cashout" });
    }
};

module.exports.startMinesGame = async (req, res) => {
    try {
        const { betAmount, mineCount } = req.body;
        const stake = Number(betAmount);

        // 1. Securely deduct balance AND ensure they have enough money in one atomic operation
        const userBefore = await User.findOneAndUpdate(
            { _id: req.user._id, balance: { $gte: stake } },
            { $inc: { balance: -stake } },
            { new: false } // Returns the balance BEFORE deduction
        );

        if (!userBefore) {
            return res.status(400).json({ error: "Insufficient balance" });
        }

        const balanceBefore = userBefore.balance;
        const balanceAfter = balanceBefore - stake;

        // 2. Create the Bet Record in MongoDB
        const newBet = await Bet.create({
            userId: req.user._id,
            marketType: "casino_mines",
            type: "casino",
            eventName: "Diamond & Mines",
            selection: `${mineCount} Mines`,
            odds: 1, // Starts at 1x
            stake: stake,
            potentialWin: 0, // Unknown until they cash out
            status: "pending"
        });

        // 3. Create the Passbook Ledger Entry
        await Ledger.create({
            userId: req.user._id,
            type: "bet_placed",
            amount: stake,
            balanceBefore: balanceBefore,
            balanceAfter: balanceAfter,
            betId: newBet._id,
            remarks: `Mines Game Started (${mineCount} Mines)`
        });

        // 4. Generate Board
        let board = new Array(25).fill("diamond");
        let count = 0;
        while (count < mineCount) {
            let rand = Math.floor(Math.random() * 25);
            if (board[rand] !== "mine") {
                board[rand] = "mine";
                count++;
            }
        }

        // 5. Save game state to session, crucially including the database betId!
        req.session.minesGame = {
            betId: newBet._id, // WE NEED THIS LATER!
            board,
            betAmount: stake,
            mineCount,
            revealed: [],
            multiplier: 1.0,
            active: true,
        };

        res.json({ success: true, balance: balanceAfter });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error starting game" });
    }
};

module.exports.revealMinesCell = async (req, res) => {
    try {
        const { tileIndex } = req.body;
        const game = req.session.minesGame;

        if (!game || !game.active) {
            return res.status(400).json({ error: "No active game" });
        }

        // BUST! Hitting a mine.
        if (game.board[tileIndex] === "mine") {
            game.active = false;
            
            // Update the Bet in MongoDB to "lost"
            await Bet.findByIdAndUpdate(game.betId, {
                status: "lost",
                payout: 0,
                settledAt: new Date()
            });

            // Clear session so they have to start a new game
            req.session.minesGame = null;
            return res.json({ status: "bust", board: game.board });
        }

        // Safe Reveal
        game.revealed.push(tileIndex);

        const n = 25;
        const m = game.mineCount;
        const k = game.revealed.length;

        const multiplier = HOUSE_EDGE * (combinations(n, k) / combinations(n - m, k));
        game.multiplier = multiplier;

        res.json({ status: "success", multiplier: multiplier.toFixed(2) });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error revealing tile" });
    }
};

module.exports.cashoutMinesGame = async (req, res) => {
    try {
        const game = req.session.minesGame;
        
        if (!game || !game.active) {
            return res.status(400).json({ success: false, error: "No active game found" });
        }

        const winAmount = Number((game.betAmount * game.multiplier).toFixed(2));

        // 1. Securely add winnings to user balance
        const userBeforeUpdate = await User.findByIdAndUpdate(
            req.user._id,
            { $inc: { balance: winAmount } },
            { new: false } // Get balance BEFORE the addition
        );

        if (!userBeforeUpdate) {
            return res.status(400).json({ success: false, error: "User not found" });
        }

        const balanceBefore = userBeforeUpdate.balance;
        const balanceAfter = balanceBefore + winAmount;

        // 2. Update the Bet in MongoDB to "won"
        await Bet.findByIdAndUpdate(game.betId, {
            status: "won",
            payout: winAmount,
            odds: game.multiplier, // Update final odds achieved
            settledAt: new Date()
        });

        // 3. Create the Passbook Ledger Receipt
        await Ledger.create({
            userId: req.user._id,
            type: "bet_won",
            amount: winAmount,
            balanceBefore: balanceBefore,
            balanceAfter: balanceAfter,
            betId: game.betId,
            remarks: `Cashed out Mines at ${game.multiplier.toFixed(2)}x`
        });

        // 4. Clear the game session so it can't be cashed out twice!
        req.session.minesGame = null;

        res.json({
            success: true,
            winAmount: winAmount,
            newBalance: balanceAfter.toFixed(2),
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
};

const STEPS = 10;

const MULTIPLIERS = {
    easy: [1.05, 1.15, 1.28, 1.45, 1.65, 1.95, 2.35, 3.00, 4.00, 5.50],
    mod:  [1.12, 1.35, 1.70, 2.20, 3.00, 4.20, 6.00, 9.00, 15.00, 30.00],
    hard: [1.25, 1.70, 2.50, 4.00, 6.50, 11.00, 20.00, 45.00, 100.00, 300.00],
    pro:  [1.48, 2.50, 5.00, 12.00, 30.00, 80.00, 250.00, 800.00, 3000.00, 10000.00]
};

const RISK = {
    // EASY: ~35% chance to crash immediately on Step 1.
    // If they try to reach Step 3, the cumulative crash chance is over 80%.
    easy:  [35, 45, 55, 65, 75, 82, 88, 92, 95, 98],

    // MEDIUM: 45% chance to crash on Step 1. 
    mod:   [45, 55, 65, 75, 85, 90, 94, 97, 98, 99],

    // HARD: Casino wins more than half the time (55%) on the very first step.
    hard:  [55, 65, 75, 85, 92, 96, 98, 99, 99, 99.5],

    // PRO: Casino wins exactly 70% of the time on STEP 1.
    // Extremely brutal. Surviving past Step 2 is rare.
    pro:   [70, 80, 88, 94, 97, 98, 99, 99.5, 99.8, 99.9]
};

// Temporary in-memory store for active games. 
const activeGames = new Map(); 

module.exports.startGame = async (req, res) => {
    try {
        const { betAmount, difficulty } = req.body;
        const userId = req.user._id;

        if (!betAmount || betAmount < 10) return res.status(400).json({ error: "Minimum bet is ₹10" });
        if (!RISK[difficulty]) return res.status(400).json({ error: "Invalid difficulty" });

        const user = await User.findById(userId);
        if (user.balance < betAmount) return res.status(400).json({ error: "Insufficient balance" });
        const balanceBefore = user.balance;
        const balanceAfter = balanceBefore - betAmount;
        // 1. Deduct balance
        user.balance -= betAmount;
        await user.save();

        // 2. CREATE THE BET RECORD (Status: playing)
        const newBet = await Bet.create({
             marketType: `Chicken Road ${difficulty}`,
            userId: user._id,
            type: 'casino',           // Required by your schema
            eventName: "Chicken Road",
            marketType: 'chicken_road', // Triggers the validation bypass
            selection: difficulty,    // Store the difficulty as the selection
            stake: betAmount,         // Your schema uses 'stake'
            odds: 0,                  // Your schema uses 'odds' for multiplier
            payout: 0,                // Your schema uses 'payout' for winnings
            status: 'pending'         // Your schema's default active state
        });

        await Ledger.create({
            userId: user._id,
            type: 'bet_placed',
            amount: betAmount,
            balanceBefore: balanceBefore,
            balanceAfter: balanceAfter,
            betId: newBet._id,
            remarks: `Placed bet on Chicken Road (${difficulty.toUpperCase()})`
        });
        
        // 3. Save active game state, INCLUDING the Bet ID so we can update it later
        activeGames.set(userId.toString(), {
            betId: newBet._id,
            betAmount,
            difficulty,
            currentStep: -1,
            active: true
        });

        res.json({ success: true, newBalance: user.balance });
    } catch (err) {
        console.error("Start Game Error:", err);
        res.status(500).json({ error: "Server error" });
    }
};

module.exports.takeStep = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const game = activeGames.get(userId);

        if (!game || !game.active) return res.status(400).json({ error: "No active game found" });

        const nextStep = game.currentStep + 1;
        if (nextStep >= STEPS) return res.status(400).json({ error: "Game already finished" });

        const crashChance = RISK[game.difficulty][nextStep];
        const roll = Math.random() * 100;

        if (roll < crashChance) {
            // ======================================
            // CRASHED: UPDATE BET RECORD TO LOST
            // ======================================
           await Bet.findByIdAndUpdate(game.betId, {
                marketType: `Chicken Road ${game.difficulty}`,
                eventName: "Chicken Road",
                status: 'lost',
                odds: 0,
                payout: 0,
                settledAt: new Date() // Good practice for your history queries
            });

            activeGames.delete(userId); // Clear session
            return res.json({ status: "crashed", step: nextStep });
        } else {
            // SAFE: Update server state and wait for next step or cashout
            game.currentStep = nextStep;
            activeGames.set(userId, game);
            
            return res.json({ 
                status: "safe", 
                step: nextStep, 
                multiplier: MULTIPLIERS[game.difficulty][nextStep] 
            });
        }
    } catch (err) {
        console.error("Take Step Error:", err);
        res.status(500).json({ error: "Server error" });
    }
};

module.exports.cashOut = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const game = activeGames.get(userId);

        if (!game || !game.active || game.currentStep < 0) {
            return res.status(400).json({ error: "Invalid cashout request" });
        }

        const multiplier = MULTIPLIERS[game.difficulty][game.currentStep];
        const winAmount = game.betAmount * multiplier;

        // 1. Fetch user and record the EXACT balance before adding winnings
        const user = await User.findById(userId);
        const balanceBefore = user.balance;

        // 2. Add winnings to user balance and save
        user.balance += winAmount;
        const balanceAfter = user.balance;
        await user.save();

        // 3. ======================================
        // CREATE LEDGER ENTRY (The Passbook Record)
        // ======================================
        await Ledger.create({
            userId: user._id,
            type: 'bet_won',
            amount: winAmount,
            balanceBefore: balanceBefore,
            balanceAfter: balanceAfter,
            betId: game.betId,
            remarks: `Won Chicken Road (${game.difficulty.toUpperCase()}) at ${multiplier}x`
        });

        // 4. ======================================
        // CASH OUT: UPDATE BET RECORD TO WON
        // ======================================
        await Bet.findByIdAndUpdate(game.betId, {
            marketType: `Chicken Road ${game.difficulty}`,
            status: 'won',
            odds: multiplier,       // Save the final multiplier
            payout: winAmount,      // Save the final win amount
            settledAt: new Date()
        });

        activeGames.delete(userId); // Game over, clear session

        res.json({ success: true, winAmount, newBalance: user.balance, multiplier });
    } catch (err) {
        console.error("Cashout Error:", err);
        res.status(500).json({ error: "Server error" });
    }
};