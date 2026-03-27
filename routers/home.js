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
        case "Football":
            const cachedFootball = await redis.get("active_football_matches");
            if (cachedFootball) {
                footballEvents = JSON.parse(cachedFootball);
            } else {
                footballEvents = await Event.find({
                    sport: { $regex: /^football$/i },
                    status: { $nin: ["settled", "finished"] }, 
                    $or: [
                        { startTime: { $gte: startDate, $lte: endDate } },
                        { status: "live" } 
                    ]
                }).sort({ startTime: 1 }).lean();

                footballEvents.sort((a, b) => {
                    if (a.status === "live" && b.status !== "live") return -1;
                    if (a.status !== "live" && b.status === "live") return 1;
                    const dateA = a.startTime ? new Date(a.startTime).getTime() : 0;
                    const dateB = b.startTime ? new Date(b.startTime).getTime() : 0;
                    return dateA - dateB;
                });
                await redis.set("active_football_matches", JSON.stringify(footballEvents), "EX", 10);
            }
            await attachLiveOdds(footballEvents);
            break;

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
            const cachedCricket = await redis.get("active_cricket_matches");
            if (cachedCricket) {
                cricketEvents = JSON.parse(cachedCricket);
            } else {
                cricketEvents = await Event.find({
                    sport: { $regex: /^cricket$/i },
                    startTime: { $gte: startDate, $lte: endDate },
                    status: { $ne: "settled" },
                }).sort({ startTime: 1 }).lean();

                cricketEvents.sort((a, b) => {
                    if (a.status === "live" && b.status !== "live") return -1;
                    if (a.status !== "live" && b.status === "live") return 1;
                    return new Date(a.startTime) - new Date(b.startTime);
                });
                await redis.set("active_cricket_matches", JSON.stringify(cricketEvents), "EX", 10);
            }
            await attachLiveOdds(cricketEvents);
            break;
    }

    // ==========================================
    // 3. Render Page
    // ==========================================
    res.render("./webpage/home.ejs", {
      activeTab,
      cricketEvents,
      footballEvents, 
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
      bets: [],
      whatsappNumber: null,
      announcement: null
    });
  }
});

module.exports = router;