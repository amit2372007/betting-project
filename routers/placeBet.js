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

const MAX_STAKE       = 50000;  // ₹50,000 max per bet — adjust to your business limit
const MIN_STAKE       = 10;     // ₹10 minimum
const MIN_ODDS        = 1.01;   // Minimum valid decimal odds
const MAX_ODDS        = 20.0;   // Maximum allowed odds
const ODDS_FRESHNESS  = 5000;   // Redis odds must be < 5 seconds old

router.post("/", isLoggedIn, async (req, res) => {
  try {
    const {
      selection, type, marketType, eventId,
      eventName, sessionId, odds, stake
    } = req.body;

    // ================================================================
    // STEP 1: PARSE & VALIDATE ALL INPUTS BEFORE TOUCHING THE DATABASE
    // ================================================================

    const numStake        = parseFloat(stake);
    const requestedOdds   = parseFloat(odds);

    // ✅ FIX 1: Validate parsed floats, not raw strings
    if (isNaN(requestedOdds) || requestedOdds < MIN_ODDS || requestedOdds > MAX_ODDS) {
      req.flash("error", `Odds must be between ${MIN_ODDS} and ${MAX_ODDS}.`);
      return res.redirect(`/event/${eventId}`);
    }

    // ✅ FIX 2: Both min AND max stake enforced
    if (isNaN(numStake) || numStake < MIN_STAKE) {
      req.flash("error", `Minimum bet amount is ₹${MIN_STAKE}.`);
      return res.redirect(`/event/${eventId}`);
    }
    if (numStake > MAX_STAKE) {
      req.flash("error", `Maximum bet amount is ₹${MAX_STAKE.toLocaleString("en-IN")}.`);
      return res.redirect(`/event/${eventId}`);
    }

    // Validate bet type
    if (!["back", "lay"].includes(type)) {
      req.flash("error", "Invalid bet type.");
      return res.redirect(`/event/${eventId}`);
    }

    // Validate marketType is one of the known types
    const VALID_MARKET_TYPES = ["match_odds", "session", "toss"];
    if (!VALID_MARKET_TYPES.includes(marketType)) {
      req.flash("error", "Invalid market type.");
      return res.redirect(eventId ? `/event/${eventId}` : "/home");
    }

    // ================================================================
    // STEP 2: LOAD THE EVENT & BLOCK BETTING IF MATCH HAS ENDED
    // ================================================================

    const event = await Event.findById(eventId);
    if (!event) {
      req.flash("error", "Event not found.");
      return res.redirect("/home");
    }

    if (event.status === "finished" || event.status === "settled") {
      req.flash("error", "This match has ended. Betting is permanently closed.");
      return res.redirect(`/event/${eventId}`);
    }

    // ================================================================
    // STEP 3: SERVER-SIDE ODDS VERIFICATION
    // Never trust the odds the browser sent. Fetch the real ones here.
    // ================================================================

    let trueOdds = null;

    if (marketType === "match_odds") {

      const liveCachedOdds = await redis.get(`live_odds_${eventId}`);
      if (!liveCachedOdds) {
        req.flash("error", "Market is currently suspended. Please wait for live odds.");
        return res.redirect(`/event/${eventId}`);
      }

      const realOddsData = JSON.parse(liveCachedOdds);

      // Block stale odds — must be fresher than ODDS_FRESHNESS ms
      if (!realOddsData.timestamp || (Date.now() - realOddsData.timestamp) > ODDS_FRESHNESS) {
        req.flash("error", "Market suspended. Please wait for live odds to refresh.");
        return res.redirect(`/event/${eventId}`);
      }

      if (selection === event.homeTeam) {
        trueOdds = type === "back" ? realOddsData.homeTeam?.back : realOddsData.homeTeam?.lay;
      } else if (selection === event.awayTeam) {
        trueOdds = type === "back" ? realOddsData.awayTeam?.back : realOddsData.awayTeam?.lay;
      } else if (selection === "The Draw") {
        trueOdds = type === "back" ? realOddsData.draw?.back : realOddsData.draw?.lay;
      }

    } else if (marketType === "session") {

      if (!sessionId) {
        req.flash("error", "Session ID is required for session bets.");
        return res.redirect(`/event/${eventId}`);
      }

      const session = await Session.findById(sessionId);
      if (!session || session.status !== "active") {
        req.flash("error", "This session is suspended or closed.");
        return res.redirect(`/event/${eventId}`);
      }

      trueOdds = type === "back" ? session.yesOdds : session.noOdds;

    } else if (marketType === "toss") {

      if (!event.tossMarket || event.tossMarket.status !== "active") {
        req.flash("error", "Toss market is suspended.");
        return res.redirect(`/event/${eventId}`);
      }

      const homeTossStr = `${event.homeTeam} (Toss)`;
      const awayTossStr = `${event.awayTeam} (Toss)`;

      if      (selection === homeTossStr) trueOdds = event.tossMarket.homeOdds;
      else if (selection === awayTossStr) trueOdds = event.tossMarket.awayOdds;
    }

    // ✅ FIX 3: Explicit invalid-selection guard with correct error message
    if (trueOdds === null || trueOdds === undefined) {
      req.flash("error", "Invalid selection. Please refresh the page and try again.");
      return res.redirect(`/event/${eventId}`);
    }

    trueOdds = parseFloat(trueOdds);

    // Block suspended markets (odds of 0, NaN, or below minimum)
    if (isNaN(trueOdds) || trueOdds < MIN_ODDS) {
      req.flash("error", "This market is currently suspended.");
      return res.redirect(`/event/${eventId}`);
    }

    // Odds drift check — reject if odds moved against the user since they clicked
    if (type === "back" && requestedOdds > trueOdds) {
      req.flash("error", `Odds dropped to ${trueOdds}. Please check the current odds and try again.`);
      return res.redirect(`/event/${eventId}`);
    }
    if (type === "lay" && trueOdds > requestedOdds) {
      req.flash("error", `Odds increased to ${trueOdds}. Your lay liability would be higher. Please try again.`);
      return res.redirect(`/event/${eventId}`);
    }

    // Lock in verified server odds for all math below
    const numOdds = trueOdds;

    // ================================================================
    // STEP 4: CALCULATE COST & POTENTIAL WIN
    // ================================================================

    let costOfBet    = 0;
    let potentialWin = 0;
    let ledgerType   = "bet_placed";
    let ledgerRemarks = `Placed ${type.toUpperCase()} on ${selection} @ ${numOdds}`;

    // NOTE ON SESSION ODDS:
    // Indian fancy/session markets use integer odds like 8, 9, 10.
    // These mean "₹8 profit per ₹100 staked" — NOT decimal multipliers.
    // So potentialWin = stake * (odds / 100), NOT stake * (odds - 1).
    // match_odds and toss use standard decimal odds (e.g. 1.95, 2.10).

    if (marketType === "match_odds" || marketType === "toss") {

      if (type === "back") {
        costOfBet    = numStake;                    // You risk your stake
        potentialWin = numStake * (numOdds - 1);    // Profit if you win
      } else if (type === "lay") {
        costOfBet    = numStake * (numOdds - 1);    // Liability you take on
        potentialWin = numStake;                    // You win backer's stake
      }

    } else if (marketType === "session") {

      // ✅ FIX 4: Correct Indian fancy market formula
      if (type === "back") {
        costOfBet    = numStake;
        potentialWin = Math.round((numStake * numOdds / 100) * 100) / 100;
      } else if (type === "lay") {
        costOfBet    = Math.round((numStake * numOdds / 100) * 100) / 100;
        potentialWin = numStake;
      }
    }

    costOfBet    = Math.round(costOfBet    * 100) / 100;
    potentialWin = Math.round(potentialWin * 100) / 100;

    // ================================================================
    // STEP 5: ATOMIC TRANSACTION — EXPOSURE, WALLET, BET, LEDGER
    // ================================================================

    const dbSession = await mongoose.startSession();
    dbSession.startTransaction();

    try {
      let balanceBefore = 0;
      let balanceAfter  = 0;
      let finalCost     = costOfBet; // For match_odds this gets recalculated below

      // --------------------------------------------------
      // 5A: MATCH ODDS — Green Book Exposure Calculation
      // --------------------------------------------------
      if (marketType === "match_odds") {

        let exposureDoc = await Exposure.findOne({
          userId:  req.user._id,
          eventId: eventId
        }).session(dbSession);

        if (!exposureDoc) {
          exposureDoc = new Exposure({
            userId:    req.user._id,
            eventId:   eventId,
            exposures: {},
            liability: 0
          });
        }

        // Build the list of all possible outcomes for this market
        const validRunners = [event.homeTeam, event.awayTeam];
        if ((event.matchOdds && event.matchOdds.drawOdds > 0) || exposureDoc.exposures.has("The Draw")) {
          validRunners.push("The Draw");
        }

        // Initialise any new runner to 0 P&L
        validRunners.forEach(team => {
          if (!exposureDoc.exposures.has(team)) {
            exposureDoc.exposures.set(team, 0);
          }
        });

        // Apply this bet's effect to every runner's P&L
        if (type === "back") {
          potentialWin = Math.round(numStake * (numOdds - 1) * 100) / 100;
          for (const team of validRunners) {
            const current = exposureDoc.exposures.get(team);
            exposureDoc.exposures.set(
              team,
              Math.round((team === selection ? current + potentialWin : current - numStake) * 100) / 100
            );
          }
        } else if (type === "lay") {
          potentialWin             = numStake;
          const layLiability       = Math.round(numStake * (numOdds - 1) * 100) / 100;
          for (const team of validRunners) {
            const current = exposureDoc.exposures.get(team);
            exposureDoc.exposures.set(
              team,
              Math.round((team === selection ? current - layLiability : current + numStake) * 100) / 100
            );
          }
        }

        // New liability = worst-case outcome across all runners
        const allValues   = validRunners.map(t => exposureDoc.exposures.get(t));
        const minExposure = Math.min(...allValues);
        const newLiability = minExposure < 0 ? minExposure : 0;
        const oldLiability = exposureDoc.liability || 0;

        // finalCost = change in locked funds (can be negative = refund on hedge)
        finalCost = Math.round((Math.abs(newLiability) - Math.abs(oldLiability)) * 100) / 100;

        exposureDoc.liability = newLiability;
        await exposureDoc.save({ session: dbSession });
      }

      // --------------------------------------------------
      // 5B: WALLET — Deduct, Refund, or No Change
      // --------------------------------------------------
      if (finalCost > 0) {

        // Deduct — atomic check ensures they actually have the funds
        const userUpdate = await User.findOneAndUpdate(
          { _id: req.user._id, balance: { $gte: finalCost } },
          { $inc: { balance: -finalCost } },
          { new: true, session: dbSession }   // ✅ FIX 5: new:true for accurate balances
        );

        if (!userUpdate) {
          throw new Error("INSUFFICIENT_FUNDS");
        }

        // ✅ FIX 5: Use the real post-update values from DB, not arithmetic estimates
        balanceAfter  = userUpdate.balance;
        balanceBefore = balanceAfter + finalCost;

      } else if (finalCost < 0) {

        // Refund — user hedged and freed up locked liability
        const refundAmount = Math.abs(finalCost);
        const userUpdate = await User.findOneAndUpdate(
          { _id: req.user._id },
          { $inc: { balance: refundAmount } },
          { new: true, session: dbSession }
        );

        balanceAfter  = userUpdate.balance;
        balanceBefore = balanceAfter - refundAmount;
        ledgerType    = "refund";
        ledgerRemarks = `Hedge Refund: freed liability on ${selection}`;

      } else {
        // Zero cost — perfect hedge, no money moves
        const user    = await User.findById(req.user._id).session(dbSession);
        balanceBefore = user.balance;
        balanceAfter  = user.balance;
      }

      // --------------------------------------------------
      // 5C: SAVE BET RECORD
      // --------------------------------------------------
      const newBet = new Bet({
        userId:       req.user._id,
        eventId:      eventId,
        eventName:    eventName,
        sessionId:    sessionId || null,
        type:         type,
        marketType:   marketType,
        selection:    selection,
        odds:         numOdds,
        stake:        numStake,
        potentialWin: potentialWin,
        status:       "pending"
      });

      await newBet.save({ session: dbSession });

      // --------------------------------------------------
      // 5D: SAVE LEDGER RECEIPT
      // ✅ FIX 6: Skip ₹0 entries — they pollute the passbook
      // --------------------------------------------------
      if (Math.abs(finalCost) >= 0.01) {
        await Ledger.create([{
          userId:        req.user._id,
          type:          ledgerType,
          amount:        Math.abs(finalCost),
          balanceBefore: balanceBefore,
          balanceAfter:  balanceAfter,
          betId:         newBet._id,
          remarks:       ledgerRemarks
        }], { session: dbSession });
      }

      // Commit everything atomically
      await dbSession.commitTransaction();
      dbSession.endSession();

      if (finalCost < 0) {
        req.flash("success", `Hedge placed! ₹${Math.abs(finalCost).toFixed(2)} refunded to your wallet.`);
      } else {
        req.flash("success", "Bet placed successfully!");
      }

      return res.redirect(`/event/${eventId}`);

    } catch (innerErr) {
      await dbSession.abortTransaction();
      dbSession.endSession();

      console.error("Place Bet Transaction Error:", innerErr);

      if (innerErr.message === "INSUFFICIENT_FUNDS") {
        req.flash("error", `Insufficient balance. You need ₹${finalCost.toFixed(2)} to place this bet.`);
      } else {
        req.flash("error", "Something went wrong while placing your bet. Please try again.");
      }

      return res.redirect(`/event/${eventId}`);
    }

  } catch (outerErr) {
    console.error("Place Bet Outer Error:", outerErr);
    req.flash("error", "An unexpected error occurred.");
    const redirectUrl = req.body.eventId ? `/event/${req.body.eventId}` : "/home";
    return res.redirect(redirectUrl);
  }
});

module.exports = router;