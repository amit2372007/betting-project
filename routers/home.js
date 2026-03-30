const express = require("express");
const router = express.Router();

const Event = require("../model/event/event.js");
const Bet = require("../model/bet/bet.js");

const WhatsappNumber = require("../model/transactions/whatsapp.js");
const Announcement = require("../model/user/announcement.js");
const redis = require("../config/redis.js");

router.get("/", async (req, res) => {
  try {
    const activeTab = req.query.tab || "Home";
    
    // Initialize empty arrays so EJS doesn't crash on inactive tabs
    let cricketEvents = [];
    let footballEvents = [];
    let tennisEvents = []; // <-- ADDED: Initialize tennisEvents
    let bets = [];
    let whatsappNumber = null;
    let announcement = null;

    // ==========================================
    // 1. Fetch Global Configs (Cached for 5 mins)
    // ==========================================
    const globalCacheKey = "site_global_configs";
    const cachedConfigs = await redis.get(globalCacheKey);
    
    if (cachedConfigs) {
        const parsedConfigs = JSON.parse(cachedConfigs);
        whatsappNumber = parsedConfigs.whatsappNumber;
        announcement = parsedConfigs.announcement;
    } else {
        // Run both DB queries at the same time
        [whatsappNumber, announcement] = await Promise.all([
            WhatsappNumber.findOne({ purpose: "deposit" }).lean(),
            Announcement.findOne({ isActive: true }).lean()
        ]);
        // Cache for 300 seconds (5 minutes)
        await redis.set(globalCacheKey, JSON.stringify({ whatsappNumber, announcement }), "EX", 300);
    }

    // Define time window for queries
    const now = new Date();
    const startDate = new Date();
    startDate.setDate(now.getDate() - 5);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setDate(now.getDate() + 2);
    endDate.setHours(23, 59, 59, 999);

    // Helper: Fetch Instant Odds
    const attachLiveOdds = async (eventsArray) => {
        if (!eventsArray || eventsArray.length === 0 || typeof redis === 'undefined') return;
        
        await Promise.all(eventsArray.map(async (event) => {
            try {
                const liveCachedOdds = await redis.get(`live_odds_${event._id}`);
                if (liveCachedOdds) {
                    const parsedOdds = JSON.parse(liveCachedOdds);
                    if (!event.matchOdds) event.matchOdds = {}; 
                    
                    event.matchOdds.homeOdds = parseFloat(parsedOdds.homeTeam?.back) || event.matchOdds.homeOdds || 0;
                    event.matchOdds.drawOdds = parseFloat(parsedOdds.drawTeam?.back) || event.matchOdds.drawOdds || 0;
                    event.matchOdds.awayOdds = parseFloat(parsedOdds.awayTeam?.back) || event.matchOdds.awayOdds || 0;
                }
            } catch (redisErr) {
                // Fail silently and keep DB odds
            }
        }));
    };

    // ==========================================
    // 2. CONDITIONAL TAB FETCHING (The Speed Boost)
    // ==========================================
    switch (activeTab) {
        
        case "MyBets":
            if (req.user) {
                bets = await Bet.find({ userId: req.user._id })
                    .sort({ createdAt: -1 })
                    .lean(); 
            }
            break;

        case "Cricket":
       case "Home":
        default:
            // 1. Check if we have a combined cache for the home page
            const cachedHome = await redis.get("active_home_matches");
            
            if (cachedHome) {
                const parsedHome = JSON.parse(cachedHome);
                cricketEvents = parsedHome.cricketEvents;
                footballEvents = parsedHome.footballEvents;
                tennisEvents = parsedHome.tennisEvents;
            } else {
                // 2. Fetch all three sports at the exact same time
                const [cricketData, footballData, tennisData] = await Promise.all([
                    Event.find({
                        sport: { $regex: /^cricket$/i },
                        startTime: { $gte: startDate, $lte: endDate },
                        status: { $ne: "settled" }
                    }).sort({ startTime: 1 }).lean(),
                    
                    Event.find({
                        sport: { $regex: /^football$/i },
                        status: { $nin: ["settled", "finished"] }, 
                        $or: [{ startTime: { $gte: startDate, $lte: endDate } }, { status: "live" }]
                    }).sort({ startTime: 1 }).lean(),
                    
                    Event.find({
                        sport: { $regex: /^tennis$/i },
                        status: { $nin: ["settled", "finished"] }, 
                        $or: [{ startTime: { $gte: startDate, $lte: endDate } }, { status: "live" }]
                    }).sort({ startTime: 1 }).lean()
                ]);

                cricketEvents = cricketData;
                footballEvents = footballData;
                tennisEvents = tennisData;

                const sortLiveFirst = (a, b) => {
                    if (a.status === "live" && b.status !== "live") return -1;
                    if (a.status !== "live" && b.status === "live") return 1;
                    return new Date(a.startTime) - new Date(b.startTime);
                };

                cricketEvents.sort(sortLiveFirst);
                footballEvents.sort(sortLiveFirst);
                tennisEvents.sort(sortLiveFirst);

                await redis.set("active_home_matches", JSON.stringify({
                    cricketEvents, footballEvents, tennisEvents
                }), "EX", 10);
            }

            await Promise.all([
                attachLiveOdds(cricketEvents),
                attachLiveOdds(footballEvents),
                attachLiveOdds(tennisEvents)
            ]);
            break;
    }

    // ==========================================
    // 3. Render Page
    // ==========================================
    res.render("./webpage/home.ejs", {
      activeTab,
      cricketEvents,
      footballEvents, 
      tennisEvents, // <-- ADDED: Pass to frontend
      bets,
      whatsappNumber,
      announcement
    });

  } catch (err) {
    console.error("Home Route Error:", err);
    req.flash("error", "Failed to load matches.");
    res.render("./webpage/home.ejs", {
      activeTab: req.query.tab || "Home",
      cricketEvents: [],
      footballEvents: [], 
      tennisEvents: [], // <-- ADDED: Pass empty array on error
      bets: [],
      whatsappNumber: null,
      announcement: null
    });
  }
});

module.exports = router;