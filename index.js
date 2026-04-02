if (process.env.NODE_ENV != "production") {
  require("dotenv").config();
}

const express = require("express");
const app = express();
const path = require("path");
const port = 8080;
const session = require("express-session");
const passport = require("passport");
const flash = require("connect-flash");
const mongoose = require("mongoose");
const ejsMate = require("ejs-mate");
const methodOverride = require("method-override");
const { CronJob } = require("cron");

const http = require("http");
const { Server } = require("socket.io");
const server = http.createServer(app);
const io = new Server(server);
const Redis = require("ioredis");

//Middleware
const {isLoggedIn , isAdmin } = require("./middleware.js");
//config
const redis = require("./config/redis.js");
const connectDB = require("./config/mongoDb.js");

//utils
const ExpressError = require('./utils/ExpressError.js')

// Models
const User = require("./model/user/user");
const Event = require("./model/event/event.js");
const Bet = require("./model/bet/bet.js");
const Transaction = require("./model/transactions/transaction.js");
const Session = require("./model/event/session.js");
const Ledger = require("./model/user/ledger.js");
const Complaint = require("./model/complain/complain.js");
const VirtualSuperOver = require("./model/virtualSuperOver/VirtualSuperOver.js");
const AviatorRound = require("./model/aviator/aviator.js");
const SevenUpBet = require("./model/7up7Down/7up7down.js");
const FruitBonanzaBet = require("./model/fruitBonanza/fruitBonanza.js");

const DepositAccount = require("./model/transactions/accountDetail.js");
const WhatsappNumber = require("./model/transactions/whatsapp.js");
const Announcement = require("./model/user/announcement.js");
const Exposure = require("./model/bet/exposure.js");

//Game Engines
const SuperOverEngine = require("./services/virtualSuperOver/VirtualSuperOverEngine.js");
const AviatorEngine = require("./services/aviator/aviatorEngine.js");

app.locals.io = io;

connectDB();

// --- 2. View Engine & Basic Settings ---
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.use(express.json());

// 🧹 ONE-TIME CLEANUP SCRIPT
mongoose.connection.once('open', async () => {
    try {
        const db = mongoose.connection.db;
        
        // 1. Forcefully drop the old ghost index that is causing the crash
        await db.collection('exposures').dropIndex('userId_1_matchId_1');
        console.log("✅ SUCCESS: Dropped the old matchId ghost index.");
    } catch (e) {
        // It will throw an error if it's already deleted, which is fine!
    }

    try {
        const db = mongoose.connection.db;
        
        // 2. Wipe out any corrupted exposure documents where matchId or eventId is null
        const result1 = await db.collection('exposures').deleteMany({ matchId: null });
        const result2 = await db.collection('exposures').deleteMany({ eventId: null });
        
        if (result1.deletedCount > 0 || result2.deletedCount > 0) {
            console.log(`✅ SUCCESS: Deleted ${result1.deletedCount + result2.deletedCount} corrupted exposure documents.`);
        }
    } catch (e) {
        console.error("Cleanup error:", e.message);
    }
});
// --- 3. Session Configuration ---
let sessionOption = {
  secret: process.env.SECRET || "mysupersecret",
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
};

// --- 4. Middleware (CRITICAL SEQUENCE) ---
app.use(session(sessionOption));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

// --- 5. Passport Configuration (MUST BE AFTER INITIALIZE) ---
passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// --- 6. Global Variables ---
app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;
  res.locals.activeTab = req.query.tab;
  res.locals.currPath = req.path;
  res.locals.aviatorEngine = aviatorEngine;
  next();
});


//all routes 
const user = require("./routers/user.js");
const transaction = require("./routers/transaction.js");
const admin = require("./routers/admin.js");
const casino = require("./routers/casino.js");
const game = require("./routers/game.js");
const event = require("./routers/event.js");
const placeBet = require("./routers/placeBet.js");
const home = require("./routers/home.js")


app.use("/user", user);
app.use("/transaction", transaction);
app.use("/admin", admin);
app.use("/casino", casino);
app.use("/game", game);
app.use("/event" , event);
app.use("/place-bet" , placeBet);
app.use("/home" , home);

app.post('/api/webhook/odds', async (req, res) => {
    // 1. The Bouncer: Check the header for the VIP pass (Cleaned up duplicate)
    const incomingKey = req.headers['x-api-key'];
    if (incomingKey !== process.env.SECRET_API_KEY) {
        console.log("🚨 Unauthorized access attempt to webhook!");
        return res.status(403).json({ error: "Unauthorized access" });
    }

    const { providerId, odds } = req.body;

    try {
        const event = await Event.findOne({ providerId: providerId });
        
        if (event) {
            // ==========================================
            // 🛑 ADMIN OVERRIDE (THE SUSPENSION CHECK)
            // ==========================================
            if (event.matchOdds && event.matchOdds.status === "suspended") {
                // The Admin has manually locked this market. 
                // We will ignore the scraper until the Admin sets it back to "active".
                return res.status(200).send('Market is suspended by Admin. Odds ignored.');
            }

            const internalRoomId = event._id.toString();
            
            // 2. THE CACHE - Save the absolute latest odds to Redis
            if (typeof redis !== 'undefined') {
                // We use Date.now() to stamp the exact millisecond this was saved
                const payloadToSave = { 
                    ...odds, 
                    timestamp: Date.now() 
                };
                await redis.set(`live_odds_${internalRoomId}`, JSON.stringify(payloadToSave));
            }

            // 3. EVENT PAGE EMIT: Broadcast to active users inside the match
            io.to(internalRoomId).emit('live_odds_update', odds);

            // 4. HOME PAGE EMIT: Broadcast globally for home.ejs to catch and flash!
            const emitData = {
                eventId: internalRoomId,
                homeOdds: odds.homeTeam?.back || 0,
                awayOdds: odds.awayTeam?.back || 0,
                homeLay: odds.homeTeam?.lay || 0,
                awayLay: odds.awayTeam?.lay || 0
            };

            // Only attach Draw odds if the scraper actually sent them
            if (odds.drawTeam) {
                emitData.drawOdds = odds.drawTeam.back;
                emitData.drawLay = odds.drawTeam.lay;
            }

            io.emit('odds_update', emitData);
            res.status(200).send('Odds processed and broadcasted');
        } else {
            res.status(404).send('Event not found');
        }
    } catch (err) {
        console.error("Webhook Error:", err);
        res.status(500).send('Server Error');
    }
});

// 2. Handle Socket Room Joining
io.on('connection', (socket) => {
    // When a user opens an event page, they ask to join that event's room
    socket.on('join_event_room', (eventId) => {
        socket.join(eventId);
        
    });
});


app.get("/lucky-spin", async (req, res) => {
    try {
        const whatsaapNumber = await WhatsappNumber.findOne({
            purpose: "deposit",
            status: "active"
        });

        res.render("./webpage/luckySpin.ejs",  {whatsaapNumber} );
    } catch (err) {
        req.flash("error", "Server Issue! Try Again");
        res.redirect("/home");
    } 
});

app.get("/refresh", (req, res) => {
    // 1. Grab the URL the user just came from
    const previousPage = req.get('Referrer');

    // 2. Redirect them back there. If Referrer is missing, fallback to /home
    if (previousPage) {
        res.redirect(previousPage);
    } else {
        res.redirect('/home');
    }
});


const vsoEngine = new SuperOverEngine(io);
const aviatorEngine = new AviatorEngine(io);

const VSO_MULTIPLIERS = {
    '0': 4.00,
    '1': 3.50,
    '2': 4.00,
    '3': 17.00,
    '4': 4.50,
    '6': 6.00,
    'W': 8.50,
    'wd': 45.00
};

app.post("/vso/place-bet", async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, error: "Please login to place a bet." });
        }

        const { eventId, selection, stake } = req.body;
        const numStake = Number(stake);

        // 1. THE SECURITY LOCK
        // Make sure this matches your engine variable (e.g., req.app.locals.vsoEngine.state)
        const currentGameState = vsoEngine.state; 

        if (currentGameState.eventId !== eventId) {
            return res.status(400).json({ success: false, error: "This match is no longer active." });
        }

        if (currentGameState.phase !== 'betting' || currentGameState.timer <= 1) {
            return res.status(400).json({ success: false, error: "Bets are closed! Wait for the next ball." });
        }

        if (!numStake || numStake < 10) {
            return res.status(400).json({ success: false, error: "Minimum bet amount is ₹10." });
        }

        // 🔥 2. DYNAMIC MULTIPLIER ROUTING 🔥
        let multiplier = 0;
        let betMarketType = "vso_next_ball";

        if (selection === 'IND_WIN') {
            multiplier = currentGameState.matchOdds.home;
            betMarketType = "vso_match_winner"; // Separate market type for the DB
        } else if (selection === 'PAK_WIN') {
            multiplier = currentGameState.matchOdds.away;
            betMarketType = "vso_match_winner";
        } else if (VSO_MULTIPLIERS[selection]) {
            multiplier = VSO_MULTIPLIERS[selection]; // Static next ball odds
        } else {
            return res.status(400).json({ success: false, error: "Invalid bet selection." });
        }

        // 3. Calculate Potential Win
        const potentialWin = numStake * (multiplier - 1);

        // 4. ATOMIC Balance Deduction
        const userBefore = await User.findOneAndUpdate(
            { _id: req.user._id, balance: { $gte: numStake } },
            { $inc: { balance: -numStake } },
            { new: false }
        );

        if (!userBefore) {
            return res.status(400).json({ success: false, error: "Insufficient balance!" });
        }

        const balanceBefore = userBefore.balance;
        const balanceAfter = balanceBefore - numStake;

        // 5. Save the Bet to MongoDB
        const newBet = await Bet.create({
            userId: req.user._id,
            eventName: eventId, 
            marketType: betMarketType, // Now correctly tags if it's a match winner or next ball
            type: "casino",
            selection: selection,
            odds: multiplier,
            stake: numStake,
            potentialWin: potentialWin,
            status: "pending"
        });

        // 6. Create the Passbook Ledger Receipt
        await Ledger.create({
            userId: req.user._id,
            type: "bet_placed",
            amount: numStake,
            balanceBefore: balanceBefore,
            balanceAfter: balanceAfter,
            betId: newBet._id,
            remarks: `VSO Bet Placed: ${selection} (Odds: ${multiplier}x)`
        });

        // 7. Return Success
        res.json({ 
            success: true, 
            newBalance: balanceAfter 
        });

    } catch (err) {
        console.error("VSO Place Bet Error:", err);
        res.status(500).json({ success: false, error: "Server error placing bet." });
    }
});

const matchAutomation = async () => {
    try {
        const now = new Date();
        
        // 🌟 THE FIX: Offset the current time by +5.5 hours to match the scraper's DB format
        const IST_OFFSET = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
        const dbNow = new Date(now.getTime() + IST_OFFSET);
        
        // Calculate our time boundaries using the synced dbNow
        const inOneHour = new Date(dbNow.getTime() + 60 * 60 * 1000);
        const inThirtyMins = new Date(dbNow.getTime() + 30 * 60 * 1000);

        // ========================================================
        // 1. SUSPEND TOSS MARKET (1 Hour Before)
        // ========================================================
        const tossEvents = await Event.find({
            sport: { $regex: /^cricket$/i },
            "tossMarket.status": "active",
            startTime: { $lte: inOneHour } 
        });

        if (tossEvents.length > 0) {
            await Promise.all(tossEvents.map(async (event) => {
                event.tossMarket.status = "suspended";
                await event.save();
                console.log(`⏱️ [CRON] Automatically suspended Toss Market for: ${event.homeTeam} vs ${event.awayTeam}`);
            }));
        }

        // ========================================================
        // 2. CHANGE EVENT STATUS (30 Mins Before)
        // ========================================================
        const startingEvents = await Event.find({
            status: "upcoming",
            startTime: { $lte: inThirtyMins } 
        });

        if (startingEvents.length > 0) {
            await Promise.all(startingEvents.map(async (event) => {
                event.status = "live"; 
                await event.save();
                console.log(`⏱️ [CRON] Match status changed to LIVE (Starts in 30m): ${event.homeTeam} vs ${event.awayTeam}`);
            }));
        }

    } catch (error) {
        console.error("❌ [CRON] Match Automation Error:", error.message);
    }
}

const job5 = new CronJob(
    "*/3 * * * *",
    matchAutomation,
    null,
    true,
    "Asia/Kolkata"
);

const settleSessionBets = async () => {
    try {
        // 1. Find all active sessions that have a result declared ("yes", "no", or "void")
        const sessionsToSettle = await Session.find({ 
            status: "settled", 
            result: { $ne: null } 
        }).lean();

        if (sessionsToSettle.length === 0) {
            return console.log("No pending sessions to settle at this time.");
        }

        console.log(`Found ${sessionsToSettle.length} session(s) to settle...`);

        for (const session of sessionsToSettle) {
            // 2. Find all pending bets linked to this specific session
            const pendingBets = await Bet.find({ 
                sessionId: session._id, 
                status: "pending" 
            });

            for (const bet of pendingBets) {
                let payout = 0;
                let finalBetStatus = "lost";
                let ledgerRemark = "";
                let ledgerType = "bet_won"; // Default to won, change to refund if voided

                // 3. Determine the outcome based on Back/Lay and Yes/No
                if (session.result === "void") {
                    // Match abandoned or session cancelled -> Refund Stake
                    finalBetStatus = "void";
                    payout = bet.stake; 
                    ledgerType = "refund";
                    ledgerRemark = `Refund: Session Voided (${session.name})`;

                } else if (bet.type === "back" && session.result === "yes") {
                    // Backed YES, result is YES -> Won (Return stake + profit)
                    finalBetStatus = "won";
                    payout = bet.stake + bet.potentialWin;
                    ledgerRemark = `Winnings: Session YES (${session.name})`;

                } else if (bet.type === "lay" && session.result === "no") {
                    // Layed NO, result is NO -> Won (Return stake + profit)
                    finalBetStatus = "won";
                    payout = bet.stake + bet.potentialWin; 
                    ledgerRemark = `Winnings: Session NO (${session.name})`;

                } else {
                    // In all other cases (Back+No or Lay+Yes) -> Lost
                    finalBetStatus = "lost";
                    payout = 0;
                }

                // 4. Update the Bet document
                bet.status = finalBetStatus;
                bet.payout = payout;
                bet.settledAt = new Date();
                await bet.save();

                // 5. If the user won or was refunded, update balance AND create Ledger
                if (payout > 0) {
                    // Use $inc but capture the OLD document to get exact balanceBefore
                    const userBeforeUpdate = await User.findByIdAndUpdate(
                        bet.userId, 
                        { $inc: { balance: payout } },
                        { new: false } // Crucial: returns the state BEFORE the $inc
                    );

                    if (userBeforeUpdate) {
                        const balanceBefore = userBeforeUpdate.balance;
                        const balanceAfter = balanceBefore + payout;

                        // Create the precise Ledger Passbook entry
                        await Ledger.create({
                            userId: bet.userId,
                            type: ledgerType, 
                            amount: payout,
                            balanceBefore: balanceBefore,
                            balanceAfter: balanceAfter,
                            betId: bet._id, // Direct link to the exact bet
                            remarks: ledgerRemark
                        });
                    }
                }
            }
        }

    } catch (error) {
        console.error("CRITICAL ERROR settling session bets:", error);
    }
};

const settleEventBets = async () => {
    try {
        // 1. Find events marked 'finished' by the admin
        const eventsToSettle = await Event.find({ 
            status: "finished", 
            result: { $ne: null } 
        }).lean();

        if (eventsToSettle.length === 0) return;

        console.log(`Found ${eventsToSettle.length} event(s) to settle receipts for...`);

        for (const event of eventsToSettle) {
            let winningSelection = "";
            const resultStr = event.result.toLowerCase();

            if (resultStr === "home") winningSelection = event.homeTeam.toLowerCase();
            else if (resultStr === "away") winningSelection = event.awayTeam.toLowerCase();
            else if (resultStr === "draw") winningSelection = "draw";
            else if (resultStr === "void") winningSelection = "void";
            else continue;

            // 2. Find pending MATCH ODDS bets
            const pendingBets = await Bet.find({ 
                eventId: event._id, 
                marketType: "match_odds", 
                status: "pending" 
            });

            for (const bet of pendingBets) {
                let finalBetStatus = "lost";
                const betSelection = bet.selection.toLowerCase();

                // 3. ONLY update the text status of the bet ticket (No Money Math!)
                if (winningSelection === "void") {
                    finalBetStatus = "void";
                } else if (bet.type === "back" && betSelection === winningSelection) {
                    finalBetStatus = "won";
                } else if (bet.type === "lay" && betSelection !== winningSelection) {
                    finalBetStatus = "won";
                }

                // 4. Save the receipt
                bet.status = finalBetStatus;
                bet.settledAt = new Date();
                await bet.save();
            }

            // 5. Lock the Event permanently
            await Event.findByIdAndUpdate(event._id, {
                $set: { status: "settled" }
            });

            console.log(`✓ Settled Receipts for: ${event.homeTeam} vs ${event.awayTeam} | Bets Processed: ${pendingBets.length}`);
        }

    } catch (error) {
        console.error("CRITICAL ERROR in settleEventBets:", error);
    }
};

// deleting the Data od VSO and CASINO from DB
const deleteOldVSOAndAviator = async () => {
    try {
        // Calculate the exact time 2 hours ago
        const twoHoursAgo = new Date();
        twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

        // Delete matches where 'completedAt' is older than 2 hours
        const result = await VirtualSuperOver.deleteMany({
            completedAt: { $lt: twoHoursAgo }
        });

        const result2 = await AviatorRound.deleteMany({
            completedAt: { $lt: twoHoursAgo }
        });

    } catch (error) {
        console.error("CRITICAL ERROR in deleteOldVSOAndAviator:", error);
    }
};

// Pending casino bets with no result will termed as lost bets
const voidPendingBets = async () => {
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        // Instantly update ALL matching documents in a single database operation
        const result = await Bet.updateMany(
            {
                type: "casino",
                status: "pending",
                createdAt: { $lt: oneHourAgo }
            },
            {
                $set: { 
                    status: "lost", 
                    settledAt: new Date() 
                }
            }
        );

        if (result.modifiedCount > 0) {
            console.log(`🧹 Sweeper found and marked ${result.modifiedCount} abandoned casino games as lost.`);
        }
        
    } catch (err) {
        console.error('❌ Error in Sweeper Cron Job:', err);
    }
};

const job = new CronJob(
  "*/5 * * * *", // Every minute
  settleSessionBets, // The function to run
  null, // onComplete
  true, // 👈 START immediately (Crucial!)
  "Asia/Kolkata", // Your local timezone
);

const job2 = new CronJob(
  "*/10 * * * *", // Every minute
  settleEventBets, // The function to run
  null, // onComplete
  true, // 👈 START immediately (Crucial!)
  "Asia/Kolkata", // Your local timezone
);

const job3 = new CronJob(
  "* */2 * * *", // Every day at midnight
  deleteOldVSOAndAviator, // The function to run
  null, // onComplete
  true, // 👈 START immediately (Crucial!
  "Asia/Kolkata", // Your local timezone
);

const job4 = new CronJob(
  "*/15 * * * *",
  voidPendingBets,
  null,
  true,
  "Asia/Kolkata",
);


app.get("/", (req, res) => {
  res.redirect("/home"); // Redirect root to home
});

// ExpressError Class-->
app.use((req, res, next) => {
  next(new ExpressError("Page not Found!", 404));
});

// Custom Error Handling
// app.js (or your middleware file)
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const devMessage = err.message || "Something went wrong";

    // SMART CHECK: Send JSON for API/Game requests
    if (req.xhr || req.headers.accept?.includes('application/json') || req.originalUrl.startsWith('/game') || req.originalUrl.startsWith('/api')) {
        return res.status(statusCode).json({
            success: false,
            error: devMessage
        });
    }

    // Dynamic text for the EJS Template
    let headline = "Whoops! We dropped the catch.";
    let description = "Don't worry, your wallet balance and active bets are 100% safe. We are just experiencing a brief technical hiccup.";

    // Change the text if it's just a broken link (404)
    if (statusCode === 404) {
        headline = "Lost in the outfield!";
        description = "The page you are looking for has been moved, deleted, or doesn't exist.";
    }

    // Render the page
    res.status(statusCode).render("error.ejs", { 
        statusCode, 
        headline,
        description,
        // Pass the raw error ONLY if in development mode
        err: process.env.NODE_ENV === 'development' ? err : null 
    });
});

server.listen(port, () => {
    console.log(`🚀  Betting Server is running on port ${port}`);
});
