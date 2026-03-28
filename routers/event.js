const express = require("express");
const router = express.Router();


const Event = require("../model/event/event.js");
const Bet = require("../model/bet/bet.js");
const Exposure = require("../model/bet/exposure.js");

const redis = require("../config/redis.js");
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Fetch data in parallel for speed
    const [eventData, bets, exposureDoc] = await Promise.all([
      Event.findById(id).populate("sessions").lean(),
      req.user ? Bet.find({ userId: req.user._id, eventId: id }).lean() : [],
      // 🌟 FIX 1 & 2: Changed matchId to eventId AND added .lean()
      req.user ? Exposure.findOne({ userId: req.user._id, eventId: id }).lean() : null
    ]);

    if (!eventData) {
      req.flash("error", "Event not found");
      return res.redirect("/home");
    }

    let event = eventData;
    
    // 🌟 FIX 3: Because of .lean(), exposureDoc.exposures is already a normal object!
    let userExposure = exposureDoc ? exposureDoc.exposures : null;

    // ==========================================================
    // 🌟 THE CRITICAL FIX: FORCE SCRAPER DATA FROM REDIS 🌟
    // ==========================================================
    if (typeof redis !== 'undefined') {
        const liveCachedOdds = await redis.get(`live_odds_${id}`);
        
        if (liveCachedOdds) {
            const parsed = JSON.parse(liveCachedOdds);
            
            // We ignore DB odds completely and build a fresh matchOdds object
            event.matchOdds = {
                // Map scraper 'homeTeam.back' -> EJS 'homeOdds'
                homeOdds: parseFloat(parsed.homeTeam?.back) || 0,
                homeLay:  parseFloat(parsed.homeTeam?.lay)  || 0,
                
                awayOdds: parseFloat(parsed.awayTeam?.back) || 0,
                awayLay:  parseFloat(parsed.awayTeam?.lay)  || 0,
                
                // Map scraper 'drawTeam' or 'draw' (depends on your scrapper payload)
                drawOdds: parseFloat(parsed.drawTeam?.back || parsed.draw?.back) || 0,
                drawLay:  parseFloat(parsed.drawTeam?.lay  || parsed.draw?.lay)  || 0,
                
                status: "active" // Force active because we have live data
            };
        } else {
            // If no data in Redis, force status to suspended so DB odds aren't used
            if (!event.matchOdds) event.matchOdds = {};
            event.matchOdds.status = "suspended";
        }
    }
    // ==========================================================

    res.render("./webpage/event.ejs", { event, bets, userExposure }); 
    
  } catch (err) {
    console.error("Event Detail Route Error:", err);
    res.redirect("/home");
  }
});

module.exports = router;

