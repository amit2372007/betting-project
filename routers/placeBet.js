const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const User = require("../model/user/user");
const Event = require("../model/event/event.js");
const Bet = require("../model/bet/bet.js");
const Session = require("../model/event/session.js");
const Ledger = require("../model/user/ledger.js");
const Exposure = require("../model/bet/exposure.js");

const redis = require("../config/redis.js");

const {isLoggedIn} = require("../middleware.js");

router.post("/", isLoggedIn, async (req, res) => {
  try {
    req.flash("error", "TECHNIQAL ISSUE");
    res.redirect("/home");
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

    if (event.status === "finished" || event.status === "settled") {
      req.flash("error", "This match has ended. Betting is permanently closed.");
      return res.redirect(`/event/${eventId}`);
    }

    // ===================================================================
    // 🛡️ THE SECURITY GATE: SERVER-SIDE ODDS VERIFICATION (PERMANENT)
    // ===================================================================
    let trueOdds = null;

    if (marketType === "match_odds") {
      // ✅ PERMANENT MODE: Fetch LIVE scraped odds from Redis cache
      const liveCachedOdds = await redis.get(`live_odds_${eventId}`);
      if (!liveCachedOdds) {
        req.flash("error", "Market is currently suspended. Wait for Live Match");
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
    if (type === "back" && requestedOdds > trueOdds) {
      req.flash("error", `Odds dropped! Current odds are now ${trueOdds}. Please check and try again.`);
      return res.redirect(`/event/${eventId}`);
    } 
    
    if (type === "lay" && trueOdds > requestedOdds) {
      req.flash("error", `Odds increased! Current odds are now ${trueOdds}. Laying this would increase your risk. Please try again.`);
      return res.redirect(`/event/${eventId}`);
    }


    // If we pass the gate, lock in the true odds for all math!
    const numOdds = trueOdds; 
    
    // ===================================================================
    // 4. GREEN BOOK & TRANSACTIONAL LOGIC
    // ===================================================================
    let costOfBet = 0;      
    let potentialWin = 0;   
    let ledgerType = "bet_placed";
    let ledgerRemarks = `Placed ${type.toUpperCase()} bet on ${selection}`;

    // Start a MongoDB Session for Atomicity (Prevents Race Conditions)
    const dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    try {
      let balanceBefore = 0;
      let balanceAfter = 0;

      if (marketType === "match_odds") {
        // 🌟 FIX: Use eventId here instead of matchId to prevent E11000 errors
        let exposureDoc = await Exposure.findOne({ 
            userId: req.user._id, 
            eventId: eventId 
        }).session(dbSession);

        if (!exposureDoc) {
            exposureDoc = new Exposure({
                userId: req.user._id,
                eventId: eventId, // 🌟 FIX: Replaced matchId with eventId
                exposures: {},
                liability: 0
            });
        }

        // Convert Map to a standard JS object for easy math
        let currentExposures = Object.fromEntries(exposureDoc.exposures || new Map());
        
        // 🌟 DYNAMIC 2-WAY vs 3-WAY FIX 🌟
        const hasDraw = event.matchOdds && event.matchOdds.drawOdds > 0;
        const validRunners = [event.homeTeam, event.awayTeam];
        if (hasDraw) {
            validRunners.push("The Draw");
        }

        // Ensure valid teams exist in the object
        validRunners.forEach(team => {
            if (currentExposures[team] === undefined) currentExposures[team] = 0;
        });

        // 2. Add the New Bet to the Exposure Map
        if (type === "back") {
          potentialWin = numStake * (numOdds - 1);
          for (let team of validRunners) {
            if (team === selection) currentExposures[team] += potentialWin;
            else currentExposures[team] -= numStake;
          }
        } else if (type === "lay") {
          potentialWin = numStake; 
          let layLiability = numStake * (numOdds - 1);
          for (let team of validRunners) {
            if (team === selection) currentExposures[team] -= layLiability;
            else currentExposures[team] += numStake;
          }
        }

        // 3. Calculate the new Liability
        let validExposureValues = validRunners.map(team => currentExposures[team]);
        let minExposure = Math.min(...validExposureValues);
        
        let newLiability = minExposure < 0 ? minExposure : 0; 
        let oldLiability = exposureDoc.liability || 0;

        // 🌟 FIX: Added Math.round to prevent floating point currency bugs
        let rawCost = Math.abs(newLiability) - Math.abs(oldLiability);
        costOfBet = Math.round(rawCost * 100) / 100;

        // 5. Update the Exposure Document in memory
        exposureDoc.exposures = currentExposures;
        exposureDoc.liability = newLiability;
        
        // Save exposure within the transaction
        await exposureDoc.save({ session: dbSession });

      } else {
        // Standard Logic for non-match-odds (Sessions, Toss)
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
        // Round standard logic too just in case
        costOfBet = Math.round(costOfBet * 100) / 100;
        potentialWin = Math.round(potentialWin * 100) / 100;
      }

      // ==========================================
      // 5. ATOMIC WALLET DEDUCTION / REFUND
      // ==========================================
      if (costOfBet > 0) {
        // DEDUCT: Ensure they have enough money for the NEW risk
        const userUpdate = await User.findOneAndUpdate(
          { _id: req.user._id, balance: { $gte: costOfBet } },
          { $inc: { balance: -costOfBet } },
          { new: false, session: dbSession } // Pass session to lock row!
        );

        if (!userUpdate) {
          throw new Error("INSUFFICIENT_FUNDS");
        }
        balanceBefore = userUpdate.balance;

      } else if (costOfBet < 0) {
        // REFUND: User hedged and freed up their locked liability!
        const refundAmount = Math.abs(costOfBet);
        const userUpdate = await User.findOneAndUpdate(
          { _id: req.user._id },
          { $inc: { balance: refundAmount } },
          { new: false, session: dbSession }
        );
        balanceBefore = userUpdate.balance;
        ledgerType = "refund"; 
        ledgerRemarks = `Hedging Refund: Freed up liability on ${selection}`;
      } else {
        // 0 COST HEDGE: Risk didn't change, just get current balance
        const user = await User.findById(req.user._id).session(dbSession);
        balanceBefore = user.balance;
      }

      balanceAfter = balanceBefore - costOfBet;

      // ==========================================
      // 6. SAVE BET & LEDGER RECEIPT
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
        stake: numStake, 
        potentialWin: potentialWin,
        status: "pending"
      });

      await newBet.save({ session: dbSession });

      await Ledger.create([{
          userId: req.user._id,
          type: ledgerType,
          amount: Math.abs(costOfBet), 
          balanceBefore: balanceBefore,
          balanceAfter: balanceAfter,
          betId: newBet._id, 
          remarks: ledgerRemarks
      }], { session: dbSession }); 

      // COMMIT THE TRANSACTION: Lock in all changes
      await dbSession.commitTransaction();
      dbSession.endSession();

      // Send Response
      if (costOfBet < 0) {
          req.flash("success", `Excellent Hedge! ₹${Math.abs(costOfBet).toFixed(2)} has been refunded to your wallet.`);
      } else {
          req.flash("success", "Bet Placed Successfully!");
      }
      return res.redirect(`/event/${eventId}`);

    } catch (err) {
      // ROLLBACK: If anything fails (like no money), cancel the whole process
      await dbSession.abortTransaction();
      dbSession.endSession();
      
      console.error("Place Bet Transaction Error:", err);
      
      if (err.message === "INSUFFICIENT_FUNDS") {
          req.flash("error", `Insufficient balance! You need ₹${costOfBet.toFixed(2)} to cover the liability of this bet.`);
      } else {
          req.flash("error", "Something went wrong while placing the bet.");
      }
      
      return res.redirect(`/event/${eventId}`);
    }
  } catch (outerErr) {
    req.flash("error", "An unexpected error occurred.");
    const redirectUrl = req.body.eventId ? `/event/${req.body.eventId}` : "/home";
    res.redirect(redirectUrl);
  }
});

module.exports = router;