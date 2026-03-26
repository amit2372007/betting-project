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


app.use("/user", user);
app.use("/transaction", transaction);
app.use("/admin", admin);
app.use("/casino", casino);
app.use("/game", game);



// 1. The Webhook Endpoint
// Add this to your main index.js

app.post('/api/webhook/odds', async (req, res) => {
    // FIX 1: SECURITY - Block unauthorized requests immediately
    // 1. The Bouncer: Check the header for the VIP pass
    const incomingKey = req.headers['x-api-key'];
    
    // 2. The Verification: Does it match our .env file?
    if (incomingKey !== process.env.SECRET_API_KEY) {
        console.log("🚨 Unauthorized access attempt to webhook!");
        return res.status(403).json({ error: "Unauthorized access" });
    }
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.SECRET_API_KEY) {
        return res.status(403).json({ error: "Unauthorized access" });
    }

    const { providerId, odds } = req.body;

    try {
        const event = await Event.findOne({ providerId: providerId });
        
        if (event) {
            const internalRoomId = event._id.toString();
            
            // FIX 2: THE CACHE - Save the absolute latest odds to Redis
            // This ensures page refreshes load the newest odds instantly
            // (Assuming you have Redis set up as 'redis' from our previous steps)
            if (typeof redis !== 'undefined') {
                await redis.set(`live_odds_${internalRoomId}`, JSON.stringify(odds));
            }

            
            
            // Broadcast to active users
            io.to(internalRoomId).emit('live_odds_update', odds);

            // 2. HOME PAGE EMIT: Broadcast globally for home.ejs to catch and flash!
            // We map this to match exactly what your home.ejs script is looking for
            io.emit('odds_update', {
                eventId: internalRoomId,
                // Safely drill down into the object just like you did in the event route
                homeOdds: odds.homeTeam?.back || odds.homeOdds || 0,
                
                // Note: I'm assuming your scraper calls the draw odds 'drawTeam'. 
                // If it's something else (like 'draw.back'), update this line:
                drawOdds: odds.drawTeam?.back || odds.drawOdds || 0, 
                
                awayOdds: odds.awayTeam?.back || odds.awayOdds || 0
            });
            
            res.status(200).send('Odds processed');
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
        console.log(`User joined room for event: ${eventId}`);
    });
});


app.get("/event/:id", async (req, res) => {
  try {
    let { id } = req.params;
    let bets = [];

    if (req.user) {
      bets = await Bet.find({ userId: req.user._id, eventId: id });
    }

    let event = await Event.findById(id).populate("sessions").lean();
    if (!event) {
      req.flash("error", "Event is either Suspended or not valid");
      return res.redirect("/home");
    }

    // === NEW: FETCH INSTANT ODDS FROM REDIS ===
    try {
        const liveCachedOdds = await redis.get(`live_odds_${id}`);
        
        if (liveCachedOdds) {
            const parsedOdds = JSON.parse(liveCachedOdds);
            
            // Inject the Redis odds into the event object right before rendering
            event.matchOdds.homeOdds = parseFloat(parsedOdds.homeTeam.back) || 0;
            event.matchOdds.awayOdds = parseFloat(parsedOdds.awayTeam.back) || 0;
            
            // If you want to pass Lay odds to the frontend immediately too:
            event.matchOdds.homeLay = parseFloat(parsedOdds.homeTeam.lay) || 0;
            event.matchOdds.awayLay = parseFloat(parsedOdds.awayTeam.lay) || 0;
        }
    } catch (redisErr) {
        console.log("Redis cache miss or error, loading default DB odds");
    }
    // ==========================================

    res.render("./webpage/event.ejs", { event, bets });
  } catch (err) {
    req.flash("error", `Database Error: ${err.message}`);
    res.redirect("/home");
  }
});

// --- 7.Home Routes ---

app.get("/home", async (req, res) => {
  try {
    const activeTab = req.query.tab || "Home";
    const cricketCacheKey = "active_cricket_matches"; 
    const footballCacheKey = "active_football_matches"; 

    // 1. Try to get data from Redis first
    const cachedCricket = await redis.get(cricketCacheKey);
    const cachedFootball = await redis.get(footballCacheKey);
    
    let cricketEvents = [];
    let footballEvents = [];

    // Define time window for query (Used for both sports)
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - 5);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setDate(now.getDate() + 2);
    endDate.setHours(23, 59, 59, 999);

    // ==========================================
    // Fetch Cricket Events
    // ==========================================
    if (cachedCricket) {
      cricketEvents = JSON.parse(cachedCricket);
    } else {
      cricketEvents = await Event.find({
        sport: { $regex: /^cricket$/i },
        startTime: { $gte: startDate, $lte: endDate },
        status: { $ne: "settled" },
      })
        .sort({ startTime: 1 })
        .lean();

      cricketEvents.sort((a, b) => {
        if (a.status === "live" && b.status !== "live") return -1;
        if (a.status !== "live" && b.status === "live") return 1;
        return new Date(a.startTime) - new Date(b.startTime);
      });

      await redis.set(cricketCacheKey, JSON.stringify(cricketEvents), "EX", 10);
    }

    // ==========================================
    // Fetch Football Events 
    // ==========================================
    if (cachedFootball) {
      footballEvents = JSON.parse(cachedFootball);
    } else {
      footballEvents = await Event.find({
        sport: { $regex: /^football$/i },
        // Exclude finished matches (so users can see 'upcoming' and 'live' matches)
        status: { $nin: ["settled", "finished"] }, 
        // Allow matches within the date range OR matches that are currently 'live'
        $or: [
          { startTime: { $gte: startDate, $lte: endDate } },
          { status: "live" } 
        ]
      })
        .sort({ startTime: 1 })
        .lean();

      footballEvents.sort((a, b) => {
        // Keep Live matches at the absolute top
        if (a.status === "live" && b.status !== "live") return -1;
        if (a.status !== "live" && b.status === "live") return 1;
        
        // Safely sort by date (handles cases where startTime is missing)
        const dateA = a.startTime ? new Date(a.startTime).getTime() : 0;
        const dateB = b.startTime ? new Date(b.startTime).getTime() : 0;
        return dateA - dateB;
      });

      await redis.set(footballCacheKey, JSON.stringify(footballEvents), "EX", 10);
    }

    // ==========================================
    // NEW: FETCH INSTANT ODDS FROM REDIS FOR ALL MATCHES
    // ==========================================
    const attachLiveOdds = async (eventsArray) => {
        if (!eventsArray || eventsArray.length === 0) return;
        
        // Use Promise.all to fetch all Redis keys concurrently for max speed
        await Promise.all(eventsArray.map(async (event) => {
            try {
                const liveCachedOdds = await redis.get(`live_odds_${event._id}`);
                if (liveCachedOdds) {
                    const parsedOdds = JSON.parse(liveCachedOdds);
                    
                    // Make sure the matchOdds object exists
                    if (!event.matchOdds) event.matchOdds = {}; 
                    
                    // Inject the live Redis odds, fallback to DB odds if missing
                    event.matchOdds.homeOdds = parseFloat(parsedOdds.homeTeam?.back) || event.matchOdds.homeOdds || 0;
                    event.matchOdds.drawOdds = parseFloat(parsedOdds.drawTeam?.back) || event.matchOdds.drawOdds || 0;
                    event.matchOdds.awayOdds = parseFloat(parsedOdds.awayTeam?.back) || event.matchOdds.awayOdds || 0;
                }
            } catch (redisErr) {
                // If Redis fails for a single match, fail silently and keep DB odds
            }
        }));
    };

    // Run the injector
    if (typeof redis !== 'undefined') {
        await attachLiveOdds(cricketEvents);
        await attachLiveOdds(footballEvents);
    }
    // ==========================================

    // ==========================================
    // Individual user data (Never cache this!)
    // ==========================================
    let bets = [];
    if (req.user) {
      bets = await Bet.find({ userId: req.user._id })
        .sort({ createdAt: -1 })
        .lean(); 
    }

    // Send everything to the frontend
    res.render("./webpage/home.ejs", {
      activeTab,
      cricketEvents,
      footballEvents, 
      bets,
    });
  } catch (err) {
    console.error("Route Error:", err);
    req.flash("error", "Failed to load matches.");
    res.render("./webpage/home.ejs", {
      activeTab: "Home",
      cricketEvents: [],
      footballEvents: [], 
      bets: [],
    });
  }
});

app.get("/lucky-spin" , (req,res)=>{
    res.render("./webpage/luckySpin.ejs" );
})

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
    '0': 6.00,
    '1': 3.70,
    '2': 6.00,
    '3': 45.00,
    '4': 5.10,
    '6': 6.00,
    'W': 11.50,
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

const settleSessionBets = async () => {
    try {
        // 1. Find all active sessions that have a result declared ("yes", "no", or "void")
        const sessionsToSettle = await Session.find({ 
            status: "suspended", 
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

            // 6. Lock the session so it doesn't get processed again
            await Session.findByIdAndUpdate(session._id, {
                $set: { status: "settled" }
            });

            console.log(`Successfully settled session: ${session.name}`);
        }

    } catch (error) {
        console.error("CRITICAL ERROR settling session bets:", error);
    }
};

const settleEventBets = async () => {
    try {
        // 1. Find events waiting to be settled. 
        // (Assuming your admin panel changes status to 'finished' when the match ends)
        const eventsToSettle = await Event.find({ 
            status: "finished", 
            result: { $ne: null } 
        }).lean();

        if (eventsToSettle.length === 0) return;

        console.log(`Found ${eventsToSettle.length} event(s) to settle...`);

        for (const event of eventsToSettle) {
            // 2. Map the "home"/"away" result to the actual team name
            let winningSelection = "";
            const resultStr = event.result.toLowerCase();

            if (resultStr === "home") {
                winningSelection = event.homeTeam.toLowerCase();
            } else if (resultStr === "away") {
                winningSelection = event.awayTeam.toLowerCase();
            } else if (resultStr === "draw") {
                winningSelection = "draw";
            } else if (resultStr === "void") {
                winningSelection = "void";
            } else {
                console.error(`Invalid result '${event.result}' for event ${event._id}`);
                continue; // Skip this event if the result is malformed
            }

            // 3. Find pending MATCH ODDS bets (Excluding sessions/toss for now)
            const pendingBets = await Bet.find({ 
                eventId: event._id, 
                marketType: "match_odds", // Ensure this matches your bet schema market type!
                status: "pending" 
            });

            for (const bet of pendingBets) {
                let payout = 0;
                let finalBetStatus = "lost";
                let ledgerRemark = "";
                let ledgerType = "bet_won"; 

                const betSelection = bet.selection.toLowerCase();

                // 4. Determine Outcome based on Back/Lay and the mapped Winning Team
                if (winningSelection === "void") {
                    // Match abandoned -> Refund
                    finalBetStatus = "void";
                    payout = bet.stake; 
                    ledgerType = "refund";
                    ledgerRemark = `Refund: Match Voided (${bet.eventName})`;

                } else if (bet.type === "back" && betSelection === winningSelection) {
                    // Backed the winner -> WON
                    finalBetStatus = "won";
                    payout = bet.stake + bet.potentialWin;
                    ledgerRemark = `Match Winnings: Backed ${bet.selection}`;

                } else if (bet.type === "lay" && betSelection !== winningSelection) {
                    // Layed a team, and ANYONE ELSE won -> WON
                    finalBetStatus = "won";
                    payout = bet.stake + bet.potentialWin; 
                    ledgerRemark = `Match Winnings: Layed ${bet.selection}`;

                } else {
                    // Lost
                    finalBetStatus = "lost";
                    payout = 0;
                }

                // 5. Save the Bet
                bet.status = finalBetStatus;
                bet.payout = payout;
                bet.settledAt = new Date();
                await bet.save();

                // 6. Secure Wallet Update & Ledger Receipt
                if (payout > 0) {
                    const userBeforeUpdate = await User.findByIdAndUpdate(
                        bet.userId, 
                        { $inc: { balance: payout } },
                        { new: false } 
                    );

                    if (userBeforeUpdate) {
                        await Ledger.create({
                            userId: bet.userId,
                            type: ledgerType, 
                            amount: payout,
                            balanceBefore: userBeforeUpdate.balance,
                            balanceAfter: userBeforeUpdate.balance + payout,
                            betId: bet._id, 
                            remarks: ledgerRemark
                        });
                    }
                }
            }

            // 7. Lock the Event (Change status to "settled" exactly like your schema)
            await Event.findByIdAndUpdate(event._id, {
                $set: { status: "settled" }
            });

            console.log(`✓ Settled Event: ${event.homeTeam} vs ${event.awayTeam} | Winner: ${winningSelection.toUpperCase()} | Bets Processed: ${pendingBets.length}`);
        }

    } catch (error) {
        console.error("CRITICAL ERROR in settleEventBets:", error);
    }
};

// deleting the Data od VSO and CASINO from DB
const deleteOldVSOAndAviator = async () => {
    try {
        // Calculate the date exactly 7 days ago
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        // Delete only matches where 'completedAt' is older than 7 days ago
        const result = await VirtualSuperOver.deleteMany({
            completedAt: { $lt: twoDaysAgo }
        });

        const result2 = await AviatorRound.deleteMany({
            completedAt: { $lt: twoDaysAgo }
        });

        console.log(`🧹 DB Cleanup: Deleted ${result.deletedCount} old VSO matches.`);
        console.log(`🧹 DB Cleanup: Deleted ${result2.deletedCount} old Aviator rounds.`);
    } catch (error) {
        console.error("CRITICAL ERROR in deleteOldVSOAndAviator:", error);
    }
};

// Pending casino bets with no result will termed as lost bets
const voidPendingBets = async () => {
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        // Find all Chicken Road bets that are STILL pending after 1 hour
        const abandonedBets = await Bet.find({
            type: "casino",
            status: 'pending',
            createdAt: { $lt: oneHourAgo }
        });

        if (abandonedBets.length === 0) return; // Nothing to clean up

        console.log(`🧹 Sweeper found ${abandonedBets.length} abandoned Chicken Road games. Cleaning up...`);

        // Loop through each stuck bet and officially close it
        for (let bet of abandonedBets) {
            // Mark it as 'lost' so the user's history shows they abandoned it
            bet.status = 'lost';
            bet.settledAt = new Date();
            await bet.save();
        } 
        
        console.log('✅ Abandoned games successfully resolved.');
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
  "0 0 * * *", // Every day at midnight
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


app.post("/place-bet", async (req, res) => {
  try {
    // 1. Authentication Check
    if (!req.user) {
      req.flash("error", "Please login to place a bet.");
      return res.redirect("/home");
    }

    const { 
      selection, type, marketType, eventId, 
      eventName, sessionId, odds, stake 
    } = req.body;

    const numStake = parseFloat(stake);
    const requestedOdds = parseFloat(odds); // What the frontend sent (Do not trust this)

    if (!odds || odds > 20) {
      req.flash("error" , "Maximum allowed odds is 20.00");
      return res.redirect(`/event/${eventId}`);
    }
    // 2. Basic Stake Validation
    if (!numStake || numStake < 10) {
      req.flash("error", "Minimum bet amount is ₹10.");
      return res.redirect(`/event/${eventId}`);
    }

    // 3. Fetch Event to verify teams
    const event = await Event.findById(eventId);
    if (!event) {
      req.flash("error", "Event not found.");
      return res.redirect("/home");
    }

    // ===================================================================
    // 🛡️ THE SECURITY GATE: SERVER-SIDE ODDS VERIFICATION
    // ===================================================================
    let trueOdds = null;

    if (marketType === "match_odds") {
      // Fetch LIVE scraped odds from Redis cache
      const liveCachedOdds = await redis.get(`live_odds_${eventId}`);
      if (!liveCachedOdds) {
        req.flash("error", "Market is currently suspended. Try again.");
        return res.redirect(`/event/${eventId}`);
      }
      
      const realOddsData = JSON.parse(liveCachedOdds);
      
      if (selection === event.homeTeam) {
        trueOdds = type === "back" ? realOddsData.homeTeam.back : realOddsData.homeTeam.lay;
      } else if (selection === event.awayTeam) {
        trueOdds = type === "back" ? realOddsData.awayTeam.back : realOddsData.awayTeam.lay;
      } else if (selection === "The Draw") {
        trueOdds = type === "back" ? realOddsData.draw?.back : realOddsData.draw?.lay;
      }
      
    } else if (marketType === "session") {
      // Fetch Fancy Session odds securely from Database
      const session = await Session.findById(sessionId);
      if (!session || session.status !== "active") {
        req.flash("error", "This session is suspended or closed.");
        return res.redirect(`/event/${eventId}`);
      }
      trueOdds = type === "back" ? session.yesOdds : session.noOdds;
      
    } else if (marketType === "toss") {
      // Fetch Toss odds securely from Database
      if (!event.tossMarket || event.tossMarket.status !== "active") {
        req.flash("error", "Toss market is suspended.");
        return res.redirect(`/event/${eventId}`);
      }
      const homeTossStr = `${event.homeTeam} (Toss)`;
      const awayTossStr = `${event.awayTeam} (Toss)`;
      
      if (selection === homeTossStr) trueOdds = event.tossMarket.homeOdds;
      else if (selection === awayTossStr) trueOdds = event.tossMarket.awayOdds;
    }

    // Convert to number for math
    trueOdds = parseFloat(trueOdds);

    // Block Suspended Markets (0.00, NaN, or Missing)
    if (isNaN(trueOdds) || trueOdds <= 1) {
      req.flash("error", "This market is currently suspended.");
      return res.redirect(`/event/${eventId}`);
    }

    // Compare requested odds vs real odds
    if (requestedOdds > trueOdds) {
      // The odds changed in the 1 second it took to click, OR they are hacking.
      req.flash("error", `Odds changed! Current odds are ${trueOdds}. Please check and place your bet again.`);
      return res.redirect(`/event/${eventId}`);
    }

    // If we pass the gate, lock in the true odds for all math!
    const numOdds = trueOdds; 
    // ===================================================================

    let costOfBet = 0;      
    let potentialWin = 0;   

    // ==========================================
    // 4. ADVANCED HEDGING LOGIC (Match Odds Only)
    // ==========================================
    if (marketType === "match_odds") {
      // Find all existing unresolved bets for this specific match
      const existingBets = await Bet.find({ 
        userId: req.user._id, 
        eventId: eventId, 
        marketType: "match_odds", 
        status: "pending" 
      });

      // Build an exposure map for all possible outcomes
      let exposure = {
        [event.homeTeam]: 0,
        [event.awayTeam]: 0,
        "The Draw": 0
      };

      // Calculate current exposures based on past bets
      existingBets.forEach(b => {
        const pWin = parseFloat(b.potentialWin) || 0;
        const stk = parseFloat(b.stake) || 0; 

        Object.keys(exposure).forEach(runner => {
          if (b.type === 'back') {
            if (runner === b.selection) exposure[runner] += pWin;
            else exposure[runner] -= stk;
          } else if (b.type === 'lay') {
            const layLiability = stk * (parseFloat(b.odds) - 1);
            if (runner === b.selection) exposure[runner] -= layLiability;
            else exposure[runner] += stk;
          }
        });
      });

      // Calculate the previous maximum risk (worst-case scenario)
      const prevMinExposure = Math.min(...Object.values(exposure));
      const prevLiability = prevMinExposure < 0 ? Math.abs(prevMinExposure) : 0;

      // Simulate adding the new bet to the exposure map
      if (type === "back") {
        potentialWin = numStake * (numOdds - 1);
        Object.keys(exposure).forEach(runner => {
          if (runner === selection) exposure[runner] += potentialWin;
          else exposure[runner] -= numStake;
        });
      } else if (type === "lay") {
        potentialWin = numStake; 
        const layLiability = numStake * (numOdds - 1);
        Object.keys(exposure).forEach(runner => {
          if (runner === selection) exposure[runner] -= layLiability;
          else exposure[runner] += numStake;
        });
      }

      // Calculate the NEW maximum risk
      const newMinExposure = Math.min(...Object.values(exposure));
      const newLiability = newMinExposure < 0 ? Math.abs(newMinExposure) : 0;

      // The true cost of the bet is the difference in liability
      costOfBet = newLiability - prevLiability;

    } else {
      // ==========================================
      // 5. STANDARD LOGIC (Sessions, Toss, Other Games)
      // ==========================================
      if (marketType === "session") {
        costOfBet = numStake;
        potentialWin = numStake * (numOdds - 1);
      } else {
        if (type === "back") {
          costOfBet = numStake;
          potentialWin = numStake * (numOdds - 1);
        } else if (type === "lay") {
          costOfBet = numStake * (numOdds - 1);
          potentialWin = numStake;
        }
      }
    }

    // ==========================================
    // 6. ATOMIC BALANCE UPDATES (Deduct or Refund)
    // ==========================================
    let userBefore;
    let ledgerType = "bet_placed";
    let ledgerRemarks = `Placed ${type.toUpperCase()} bet on ${selection}`;

    if (costOfBet > 0) {
      // DEDUCT: User is taking on more risk
      userBefore = await User.findOneAndUpdate(
        { _id: req.user._id, balance: { $gte: costOfBet } },
        { $inc: { balance: -costOfBet } },
        { new: false } 
      );

      if (!userBefore) {
        req.flash("error", `Insufficient balance! You need ₹${costOfBet.toFixed(2)} to place this bet.`);
        return res.redirect(`/event/${eventId}`);
      }
    } else if (costOfBet < 0) {
      // REFUND: User is hedging and reducing their risk!
      const refundAmount = Math.abs(costOfBet);
      userBefore = await User.findOneAndUpdate(
        { _id: req.user._id },
        { $inc: { balance: refundAmount } },
        { new: false } 
      );
      ledgerType = "hedge_refund";
      ledgerRemarks = `Hedging Refund: ${type.toUpperCase()} bet on ${selection}`;
    } else {
      // COST IS 0: Perfect hedge, no balance change required
      userBefore = await User.findById(req.user._id);
    }

    const balanceBefore = userBefore.balance;
    const balanceAfter = balanceBefore - costOfBet; 

    // ==========================================
    // 7. SAVE THE BET & LEDGER
    // ==========================================
    const newBet = new Bet({
      userId: req.user._id,
      eventId: eventId,
      eventName: eventName,
      sessionId: sessionId ? sessionId : null, 
      type: type, 
      marketType: marketType,
      selection: selection,
      odds: numOdds,
      stake: numStake, // ALWAYS save nominal stake for frontend math to work
      potentialWin: potentialWin,
      status: "pending"
    });

    await newBet.save();

    await Ledger.create({
        userId: req.user._id,
        type: ledgerType,
        amount: Math.abs(costOfBet), 
        balanceBefore: balanceBefore,
        balanceAfter: balanceAfter,
        betId: newBet._id, 
        remarks: ledgerRemarks
    });

    if (costOfBet < 0) {
        req.flash("success", `Excellent Hedge! ₹${Math.abs(costOfBet).toFixed(2)} has been refunded to your wallet.`);
    } else {
        req.flash("success", "Bet Placed Successfully!");
    }
    
    res.redirect(`/event/${eventId}`);

  } catch (err) {
    console.error("Place Bet Error:", err);
    req.flash("error", "Something went wrong while placing the bet.");
    const redirectUrl = req.body.eventId ? `/event/${req.body.eventId}` : "/home";
    res.redirect(redirectUrl);
  }
});

app.get("/", (req, res) => {
  res.redirect("/home"); // Redirect root to home
});

// ExpressError Class-->
app.use((req, res, next) => {
  next(new ExpressError(404, "Page not Found!"));
});

// Custom Error Handling
// app.js (or your middleware file)
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const devMessage = err.message || "Something went wrong";

    console.error(`[Error] ${statusCode}: ${devMessage}`);

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
