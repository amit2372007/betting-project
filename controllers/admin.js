const User = require("../model/user/user.js");
const Event = require("../model/event/event.js");
const Bet = require("../model/bet/bet.js");
const Transaction = require("../model/transactions/transaction.js");
const Session = require("../model/event/session.js");
const Complaint = require("../model/complain/complain.js");
const DepositAccount = require("../model/transactions/accountDetail.js");
const WhatsappNumber = require("../model/transactions/whatsapp.js");
const Announcement = require("../model/user/announcement.js");
const Exposure = require("../model/bet/exposure.js");
const Ledger = require("../model/user/ledger.js");
const redis = require("../config/redis.js");

module.exports.renderAdminDashboard = async (req, res) => {
  try {
    const activeTab = req.query.tab || "Dashboard";

    // 1. Initialize ALL variables as empty arrays/objects so EJS never crashes on inactive tabs
    let users = [];
    let activeEvents = [], liveEvents = [], upcomingEvents = [];
    let deposits = [], withdrawals = [];
    let totalUsers = 0;
    let complaints = [], stats = { open: 0, inProgress: 0, resolvedToday: 0 };
    let whatsappNumbers = [], announcements = [];

    // Helper: Start of today for date calculations
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // ==========================================
    // 2. CONDITIONAL FETCHING (Perfectly mapped to your EJS tabs)
    // ==========================================
    switch (activeTab) {
      case "UserManagement": 
        // Maps to includes/admin/userManagement.ejs
        users = await User.find().sort({ createdAt: -1 }).lean();
        break;

      case "Events":
        // Maps to includes/admin/events/events.ejs
        activeEvents = await Event.find({ status: { $ne: "settled" } }).sort({ startTime: 1 }).lean();
        break;

      case "Finances": 
        // Maps to includes/admin/finances/finances.ejs (Deposits)
        deposits = await Transaction.find({ type: "deposit" })
          .sort({ createdAt: -1 })
          .populate("userId", "username email")
          .lean();
        break;

      case "Withdrawals":
        // Maps to includes/admin/finances/withdrawals.ejs
        withdrawals = await Transaction.find({ type: "withdraw" })
          .sort({ createdAt: -1 })
          .populate("userId", "username email")
          .lean();
        break;

      case "Complaints":
        // Maps to includes/admin/complaints.ejs
        complaints = await Complaint.find()
          .populate('userId', 'name _id')
          .sort({ createdAt: -1 })
          .lean();

        stats.open = complaints.filter(c => c.status === 'Open').length;
        stats.inProgress = complaints.filter(c => c.status === 'In Progress').length;
        stats.resolvedToday = complaints.filter(c => c.status === 'Resolved' && new Date(c.updatedAt) >= startOfToday).length;
        break;

      case "WhatsApp": 
        // Maps to includes/admin/WhatsAppManage.ejs
        whatsappNumbers = await WhatsappNumber.find().sort({ createdAt: -1 }).lean();
        break;

      case "Dashboard":
      default:
        // 🚀 HIGH-SPEED DASHBOARD SUMMARY
        // Maps to includes/admin/dashboard/dashboard.ejs
        // We use Promise.all to fetch exactly what the main dashboard needs in parallel
        const [dashEvents, dashDeposits, dashWithdrawals, dashUsersCount, dashAnnouncements] = await Promise.all([
            Event.find({ status: { $ne: "settled" } }).sort({ startTime: 1 }).lean(),
            Transaction.find({ type: "deposit" }).lean(), 
            Transaction.find({ type: "withdraw" }).lean(), 
            User.countDocuments(),
            Announcement.find({}).sort({ createdAt: -1 }).lean()
        ]);

        activeEvents = dashEvents;
        liveEvents = activeEvents.filter(event => event.status === "live");
        upcomingEvents = activeEvents.filter(event => event.status === "pending" || event.status === "upcoming");
        
        deposits = dashDeposits;
        withdrawals = dashWithdrawals;
        totalUsers = dashUsersCount;
        announcements = dashAnnouncements;
        break;
    }

    req.flash("success", "Welcome Amit to the Admin Dashboard!");
    
    // 3. Render Dashboard with all variables securely passed
    res.render("./admin/dashboard.ejs", { 
      activeTab, 
      users,
      complaints,
      stats,
      activeEvents, 
      liveEvents, 
      upcomingEvents,
      deposits,            
      withdrawals,         
      totalUsers,
      whatsappNumbers,
      announcements,
    });

  } catch (err) {
    console.error("Error loading admin dashboard:", err);
    req.flash("error", "Failed to load admin dashboard.");
    return res.redirect("/home"); 
  }
};

module.exports.renderAddEventPage = (req, res) => {
  res.render("./admin/addEvent.ejs");
};

module.exports.renderManagePayments = async (req, res) => {
  try {
    const accountDetails = await DepositAccount.find().lean();
    res.render("./admin/managePayments.ejs", { accountDetails});
  } catch (error) {
    console.error("Error fetching account details:", error);
    req.flash("error", "Failed to load payment methods.");
    return res.redirect("/admin?tab=Dashboard");
  }
};

module.exports.renderEventDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Event.findById(id).lean().populate("sessions");
    if (!event) {
      req.flash("error", "Event not found");
      return res.redirect("/admin?tab=Dashboard");
    }
    res.render("./admin/eventDetails.ejs", { Event: event });
  } catch (error) {
    console.error("Error fetching event:", error);
    req.flash("error", "Failed to load event details.");
    return res.redirect("/admin?tab=Dashboard");
  }
};

module.exports.renderUserManagement = async (req, res) => { 
  try { 
    const { id } = req.params;
    const user = await User.findById(id).lean();
    if (!user) {
      req.flash("error", "User not found.");

      return res.redirect("/admin?tab=UserManagement"); 
    }
    res.render("./admin/adjustBalance.ejs", { user });
  } catch (error) {
    console.error("Error loading balance adjustment page:", error);
    req.flash("error", "Failed to load balance adjustment page.");
    return res.redirect("/admin?tab=UserManagement");
  }
};

module.exports.renderUserHistory = async (req, res) => {
    try {
        const { id } = req.params;
        
        // 1. Fetch User
        const user = await User.findById(id).lean();
        if (!user) {
            req.flash("error", "User not found.");
            return res.redirect("/admin?tab=UserManagement");
        }

        // 2. Fetch User's Bets & Transactions
        const bets = await Bet.find({ userId: id }).lean() || [];
        const transactions = await Transaction.find({ userId: id }).lean() || [];

        // 3. Separate Deposits & Withdrawals for Stats Calculation
        const deposits = transactions.filter(t => t.type === 'deposit');
        const withdrawals = transactions.filter(t => t.type === 'withdrawal');

        const totalDeposits = deposits.filter(t => t.status === 'approved').reduce((sum, t) => sum + (t.amount || 0), 0);
        const totalWithdrawals = withdrawals.filter(t => t.status === 'approved').reduce((sum, t) => sum + (t.amount || 0), 0);

        let wonBets = 0;
        let totalStake = 0;
        let maxWin = 0;
        let settledBets = 0;

        // 4. Build the Unified Ledger Array
        const ledger = [];

        // Add Bets to Ledger
        bets.forEach(bet => {
            totalStake += (bet.stake || 0);
            if (bet.status !== 'pending') settledBets++;
            if (bet.status === 'won') {
                wonBets++;
                if (bet.payout > maxWin) maxWin = bet.payout;
            }
            
            ledger.push({
                _id: bet._id,
                type: 'bet',
                category: bet.status, // 'won', 'lost', 'pending'
                title: bet.gameName || 'Sports Bet',
                details: bet.selection || 'N/A',
                amount: bet.stake,
                odds: bet.multiplier || bet.odds || '--',
                status: bet.status,
                payout: bet.payout,
                createdAt: bet.createdAt
            });
        });

        // Add Transactions to Ledger
        transactions.forEach(t => {
            ledger.push({
                _id: t._id,
                type: t.type, // 'deposit' or 'withdrawal'
                category: t.type,
                title: t.type === 'deposit' ? 'Deposit' : 'Withdrawal',
                details: t.method || 'Bank/Wallet',
                amount: t.amount,
                odds: '--',
                status: t.status, // 'approved', 'pending', 'rejected'
                payout: t.type === 'deposit' ? t.amount : -t.amount,
                createdAt: t.createdAt
            });
        });

        // Sort the entire ledger from newest to oldest
        ledger.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // 5. Calculate Averages
        const winRate = settledBets > 0 ? ((wonBets / settledBets) * 100).toFixed(1) : 0;
        const avgStake = bets.length > 0 ? (totalStake / bets.length).toFixed(2) : 0;

        const stats = {
            totalDeposits,
            totalWithdrawals,
            winRate,
            avgStake,
            maxWin,
            totalBets: bets.length
        };

        // 6. Render the page
        res.render("./admin/userHistory.ejs", { user, ledger, stats });

    } catch (error) {
        console.error("Error loading user history page:", error);
        req.flash("error", "Failed to load user history page.");
        return res.redirect("/admin?tab=UserManagement");
    }
};

module.exports.addPaymentMethod = async (req, res) => {
    try {
        const { 
            methodType, displayName, minDeposit, maxDeposit, 
            accountName, accountNumber, ifscCode, bankName,
            upiId, merchantName, qrCodeUrl
        } = req.body;

        // Build the payload dynamically based on the selected type
        const payload = {
            methodType,
            displayName,
            minDeposit: minDeposit || 100,
            maxDeposit: maxDeposit || 50000,
            isActive: true
        };

        if (methodType === 'bank_transfer') {
            payload.bankDetails = { accountName, accountNumber, ifscCode, bankName };
        } else if (methodType === 'upi') {
            payload.upiDetails = { upiId, merchantName };
        } else if (methodType === 'qr_scanner') {
            payload.upiDetails = { upiId, merchantName };
            payload.qrCodeUrl = qrCodeUrl;
        }

        await DepositAccount.create(payload);
        req.flash("success", "Payment method added successfully!");
        res.redirect("/admin/manage-payments");

    } catch (error) {
        console.error("Error adding payment method:", error);
        req.flash("error", "Failed to add payment method.");
        res.redirect("/admin/manage-payments");
    }
};

module.exports.deletePaymentMethod = async (req, res) => {
    try {
        await DepositAccount.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error("Error deleting account:", error);
        res.status(500).json({ success: false });
    }
};

module.exports.togglePaymentMethod = async (req, res) => {
    try {
        const { isActive } = req.body;
        await DepositAccount.findByIdAndUpdate(req.params.id, { isActive });
        res.json({ success: true });
    } catch (error) {
        console.error("Error toggling status:", error);
        res.status(500).json({ success: false });
    }
};

module.exports.addEvent = async (req, res) => {
  try {
    // 1. Destructure the data coming from the HTML form inputs (req.body)
    // Thanks to the updated EJS 'name' attributes, these now match your schema perfectly.
    const {
      sport,
      league,
      eventId,
      startTime,
      status,
      providerId,
      homeTeam,
      homeId,
      awayTeam,
      awayId,
      matchOdds,  // This comes in as an object containing back/lay odds
      tossMarket  // This comes in as an object containing back/lay odds
    } = req.body;

    // 2. Map the form data to your Mongoose schema structure
    const newEvent = new Event({
      sport,
      league,
      eventId,
      homeTeam,
      homeId,
      awayTeam,
      awayId,
      startTime,
      status,
      providerId,
      
      // We parse the nested odds as Floats safely using optional chaining (?)
      matchOdds: {
        homeOdds: parseFloat(matchOdds?.homeOdds) || 0,
        homeLay:  parseFloat(matchOdds?.homeLay)  || 0,
        awayOdds: parseFloat(matchOdds?.awayOdds) || 0,
        awayLay:  parseFloat(matchOdds?.awayLay)  || 0,
        drawOdds: parseFloat(matchOdds?.drawOdds) || 0,
        drawLay:  parseFloat(matchOdds?.drawLay)  || 0,
        status: "active" 
      },
      
      tossMarket: {
        homeOdds: parseFloat(tossMarket?.homeOdds) || 0,
        homeLay:  parseFloat(tossMarket?.homeLay)  || 0,
        awayOdds: parseFloat(tossMarket?.awayOdds) || 0,
        awayLay:  parseFloat(tossMarket?.awayLay)  || 0,
        status: "active",
        winner: null
      }
    });

    // 3. Save to database
    await newEvent.save();
    
    req.flash("success", "Event created successfully!");
    res.redirect("/admin?=tab=Dashboard");

  } catch (error) {
    console.error("Error creating event:", error);
    res.status(500).json({ message: "Internal Server Error while creating event", error: error.message });
  }
};

module.exports.updateEventStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, result } = req.body;
    const event = await Event.findById(id);
    if (!event) {
      req.flash("error", "Event not found");
      return res.redirect("/admin?tab=Dashboard");
    }

    event.status = status;
    event.result = result;
    await event.save();

    // =========================================================
    // 🟢 GREEN BOOK O(1) INSTANT WALLET SETTLEMENT 🟢
    // =========================================================
    if (status === "finished" && result) {
        let winningTeam = "";
        const resLower = result.toLowerCase();
        
        // Map the admin dropdown result to the actual team name
        if (resLower === "home") winningTeam = event.homeTeam;
        else if (resLower === "away") winningTeam = event.awayTeam;
        else if (resLower === "draw") winningTeam = "The Draw";
        else if (resLower === "void") winningTeam = "void";

        if (winningTeam) {
            console.log(`🏆 Initiating Payouts for Winner: ${winningTeam}`);

            // 🌟 THE FIX: Find ALL exposures that aren't already settled
            const activeExposures = await Exposure.find({ 
                eventId: id, 
                status: { $ne: 'SETTLED' } 
            });

            console.log(`Found ${activeExposures.length} users to settle for this match.`);

            for (let exposure of activeExposures) {
                let payout = 0;
                let ledgerType = "bet_won";
                let remarks = `Match Payout: ${event.homeTeam} vs ${event.awayTeam}`;

                if (winningTeam === "void") {
                    // Match Voided: Refund the locked liability completely
                    payout = Math.abs(exposure.liability || 0);
                    ledgerType = "refund";
                    remarks = `Match Voided Refund: ${event.homeTeam} vs ${event.awayTeam}`;
                } else {
                    // 🌟 THE FIX: Bulletproof Map-to-Object conversion
                    const rawExposures = exposure.exposures;
                    const exposuresObj = (rawExposures instanceof Map) 
                        ? Object.fromEntries(rawExposures) 
                        : (rawExposures || {});
                    
                    // Get the exact Profit/Loss for the team that won
                    const userOutcomePnL = exposuresObj[winningTeam] || 0;
                    
                    // The Liability was already deducted when they placed the bet.
                    // The magic formula: Payout = Locked Liability + The Outcome's PnL
                    const lockedLiability = Math.abs(exposure.liability || 0);
                    payout = lockedLiability + userOutcomePnL;
                }

                if (payout > 0) {
                    // Atomically add the winnings directly to the wallet
                    const userUpdate = await User.findByIdAndUpdate(
                        exposure.userId,
                        { $inc: { balance: payout } },
                        { new: false } // Returns balance BEFORE the update
                    );

                    // Create the passbook receipt
                    if (userUpdate) {
                        await Ledger.create({
                            userId: exposure.userId,
                            type: ledgerType,
                            amount: payout,
                            balanceBefore: userUpdate.balance,
                            balanceAfter: userUpdate.balance + payout,
                            remarks: remarks
                        });
                        console.log(`✅ Paid ₹${payout} to User: ${userUpdate.username || exposure.userId}`);
                    }
                } else {
                     console.log(`❌ User ${exposure.userId} lost or broke even. Payout: ₹0`);
                }

                // Close out this user's position for this match permanently
                exposure.status = 'SETTLED';
                exposure.liability = 0; 
                await exposure.save();
            }
            console.log(`🏁 O(1) Exposure Settlement Complete for: ${event.homeTeam} vs ${event.awayTeam}`);
        }
    }
    // =========================================================

    req.flash("success", "Event status updated and payouts processed successfully!");
    res.redirect(`/admin/event/${id}`);
  } catch (error) {
    console.error("Error updating event status:", error);
    req.flash("error", "Failed to update event status.");
    return res.redirect("/admin?tab=Dashboard");
  }
};
module.exports.updateMatchOdds = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 1. Destructure ALL inputs sent from your EJS form, including the Lay odds
    const { 
      homeOdds, homeLay,
      drawOdds, drawLay,
      awayOdds, awayLay, 
      marketStatus 
    } = req.body;

    // The checkbox only sends "active" if checked. If unchecked, it's undefined.
    const resolvedStatus = marketStatus === "active" ? "active" : "suspended";

    // 2. Update the database with both Back and Lay odds
    const updatedEvent = await Event.findByIdAndUpdate(
      id,
      {
        "matchOdds.homeOdds": parseFloat(homeOdds) || 0,
        "matchOdds.homeLay": parseFloat(homeLay) || 0,
        
        "matchOdds.drawOdds": parseFloat(drawOdds) || 0,
        "matchOdds.drawLay": parseFloat(drawLay) || 0,
        
        "matchOdds.awayOdds": parseFloat(awayOdds) || 0,
        "matchOdds.awayLay": parseFloat(awayLay) || 0,
        
        "matchOdds.status": resolvedStatus
      },
      { new: true } 
    );

    if (!updatedEvent) {
      req.flash("error", "Event not found");
      return res.redirect("/admin?tab=Dashboard");
    }

    req.flash("success", `Match odds updated! Market is now ${resolvedStatus.toUpperCase()}.`);
    res.redirect(`/admin/event/${id}`);
    
  } catch (error) {
    console.error("Error updating match odds:", error);
    req.flash("error", "Failed to update match odds.");
    res.redirect(`/admin/event/${req.params.id}`);
  }
};

module.exports.updateTossResult = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Match the exact name attributes from your EJS form
    const { homeOdds, homeLay, awayOdds, awayLay, status, winner } = req.body;

    const event = await Event.findById(id);
    if (!event) {
      req.flash("error", "Event not found");
      return res.redirect("/admin?tab=Dashboard");
    }

    const resolvedWinner = winner === "" ? null : winner;

    // =========================================================
    // 🪙 TOSS SETTLEMENT PAYOUT LOGIC
    // =========================================================
    // If Admin selects "Settled" and it wasn't already settled before
    if (status === "settled" && event.tossMarket.status !== "settled") {
        
        if (!resolvedWinner) {
            req.flash("error", "You must select a Toss Winner to settle the market.");
            return res.redirect(`/admin/event/${id}`);
        }

        let winningSelection = "";
        let isVoid = false;

        // Map the admin dropdown result to the actual bet string
        if (resolvedWinner === "home") winningSelection = `${event.homeTeam} (Toss)`;
        else if (resolvedWinner === "away") winningSelection = `${event.awayTeam} (Toss)`;
        else if (resolvedWinner === "void") isVoid = true;

        // Find all pending Toss bets for this specific match
        const pendingTossBets = await Bet.find({
            eventId: id,
            marketType: "toss",
            status: "pending"
        });

        console.log(`🪙 Settling ${pendingTossBets.length} Toss Bets...`);

        // Process Payouts
        for (const bet of pendingTossBets) {
            let payout = 0;
            let finalStatus = "lost";
            let ledgerType = "bet_won";
            let remarks = `Toss Winnings: ${event.homeTeam} vs ${event.awayTeam}`;

            if (isVoid) {
                // Refund the stake if the toss was cancelled
                payout = bet.stake;
                finalStatus = "void";
                ledgerType = "refund";
                remarks = `Toss Voided Refund: ${event.homeTeam} vs ${event.awayTeam}`;
            } else if (bet.type === "back" && bet.selection === winningSelection) {
                // Backed the correct team
                payout = bet.stake + bet.potentialWin;
                finalStatus = "won";
            } else if (bet.type === "lay" && bet.selection !== winningSelection) {
                // Layed the wrong team (meaning you win)
                payout = bet.stake + bet.potentialWin;
                finalStatus = "won";
            } else {
                payout = 0;
                finalStatus = "lost";
            }

            // Update user wallet and create Ledger receipt
            if (payout > 0) {
                const userUpdate = await User.findByIdAndUpdate(
                    bet.userId,
                    { $inc: { balance: payout } },
                    { new: false } // Get balance BEFORE update
                );

                if (userUpdate) {
                    await Ledger.create({
                        userId: bet.userId,
                        type: ledgerType,
                        amount: payout,
                        balanceBefore: userUpdate.balance,
                        balanceAfter: userUpdate.balance + payout,
                        betId: bet._id, 
                        remarks: remarks
                    });
                    console.log(`✅ Paid ₹${payout} to User for Toss Win`);
                }
            }

            // Update the individual Bet Receipt
            bet.status = finalStatus;
            bet.payout = payout;
            bet.settledAt = new Date();
            await bet.save();
        }
    }
    // =========================================================

    // Update the Event Document with the new odds and status
    event.tossMarket.homeOdds = parseFloat(homeOdds) || 0;
    event.tossMarket.homeLay  = parseFloat(homeLay) || 0;
    event.tossMarket.awayOdds = parseFloat(awayOdds) || 0;
    event.tossMarket.awayLay  = parseFloat(awayLay) || 0;
    event.tossMarket.status   = status;
    event.tossMarket.winner   = resolvedWinner;
    
    await event.save();

    if (status === 'settled') {
        req.flash("success", "Toss market settled and winners paid out successfully!");
    } else {
        req.flash("success", "Toss market updated successfully!");
    }
    
    res.redirect(`/admin/event/${id}`);
    
  } catch (error) {
    console.error("Error updating toss market:", error);
    req.flash("error", "Failed to update toss market.");
    res.redirect(`/admin/event/${req.params.id}`);
  }
};

module.exports.addSession = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, value, yesOdds, noOdds , category} = req.body;

    // Create the new session object
    const newSession = new Session( {
      eventId: id, 
      marketId: `sess_${Date.now()}`,
      name: name,
      category: category,
      value: parseFloat(value),
      yesOdds: parseFloat(yesOdds),
      noOdds: parseFloat(noOdds),
      status: "active",
      result: null
    });

    // Push it to the sessions array in MongoDB
    await Event.findByIdAndUpdate(id, {
      $push: { sessions: newSession }
    });
    await newSession.save();
    await Event.save();
    req.flash("success", "Session market added successfully!");
    res.redirect(`/admin/event/${id}`);

  } catch (error) {
    console.error("Error adding session:", error);
    req.flash("error", "Failed to add session market.");
    res.redirect(`/admin/event/${req.params.id}`);
  }
};

module.exports.updateSession = async (req, res) => {
  try {
    const { eventId, sessionId } = req.params;
    
    const { category, yesOdds, noOdds, status, result } = req.body;

    const resolvedResult = result === "" ? null : result;

    const updatedSession = await Session.findByIdAndUpdate(
      sessionId,
      {
        $set: {
          category: category, // 2. Add it here
          yesOdds: parseFloat(yesOdds) || 0,
          noOdds: parseFloat(noOdds) || 0,
          status: status,
          result: resolvedResult
        }
      },
      { new: true }
    );

    if (!updatedSession) {
      req.flash("error", "Session not found");
      return res.redirect(`/admin/event/${eventId}`);
    }

    // Optional: Emit WebSocket event here to update user screens!
    // const io = req.app.get("io");
    // io.to(eventId).emit("sessionUpdated", updatedSession);

    // If result was settled to 'yes' or 'no', here is where you would call 
    // a function to distribute funds to users who won their bets!

    req.flash("success", "Session updated successfully!");
    res.redirect(`/admin/event/${eventId}`);

  } catch (error) {
    console.error("Error updating session:", error);
    req.flash("error", "Failed to update session.");
    res.redirect(`/admin/event/${req.params.eventId}`);
  }
};

module.exports.processTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Extract the action (from the button value) and the remarks input
    const { action, remarks } = req.body; 

    // 1. Find the transaction
    const transaction = await Transaction.findById(id);

    if (!transaction) {
      req.flash("error", "Transaction not found.");
      return res.redirect("/admin?tab=Finances");
    }

    // 2. Prevent double-processing
    if (transaction.status !== "pending") {
      req.flash("error", "This transaction has already been processed.");
      return res.redirect("/admin?tab=Finances");
    }

    // Determine the new status based on which button was clicked
    const newStatus = action === "approve" ? "approved" : "rejected";

    // 3. Handle Wallet Balances Securely
    
    // SCENARIO A: Deposit is Approved -> Add money to wallet
    if (transaction.type === "deposit" && newStatus === "approved") {
      await User.findByIdAndUpdate(transaction.userId, {
        $inc: { balance: transaction.amount } // Assumes your User model has a 'balance' field
      });
    }

    // SCENARIO B: Withdrawal is Rejected -> Refund money to wallet
    // (This assumes you deducted the balance immediately when the user requested the withdrawal to prevent them from spending it while waiting)
    if (transaction.type === "withdraw" && newStatus === "rejected") {
      await User.findByIdAndUpdate(transaction.userId, {
        $inc: { balance: transaction.amount }
      });
    }

    // 4. Update and save the transaction record
    transaction.status = newStatus;
    transaction.remarks = remarks ? remarks.trim() : ""; // Save the admin's note
    transaction.settledAt = Date.now();
    await transaction.save();

    req.flash("success", `Transaction successfully ${newStatus}!`);
    res.redirect("/admin?tab=Finances");

  } catch (error) {
    console.error("Error processing transaction:", error);
    req.flash("error", "A server error occurred while processing the transaction.");
    res.redirect("/admin?tab=Finances");
  }
};

module.exports.adjustUserBalance = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 'action' should be either 'credit' or 'debit' coming from your modal's radio buttons
    const { action, amount, remarks } = req.body; 
    const numericAmount = parseFloat(amount);

    if (!numericAmount || numericAmount <= 0) {
      req.flash("error", "Please enter a valid amount greater than 0.");
      return res.redirect("/admin?tab=UserManagement");
    }

    const user = await User.findById(id);
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/admin?tab=UserManagement");
    }

    // Prevent negative balances if the admin tries to debit too much
    if (action === "debit" && (user.balance || 0) < numericAmount) {
      req.flash("error", `Cannot deduct ₹${numericAmount}. User only has ₹${user.balance}.`);
      return res.redirect("/admin?tab=UserManagement");
    }

    // Calculate the adjustment (positive for credit, negative for debit)
    const adjustment = action === "credit" ? numericAmount : -numericAmount;

    // 1. Update the User's Balance using $inc for thread safety
    await User.findByIdAndUpdate(id, {
      $inc: { balance: adjustment }
    });

    // 2. Create an automatic transaction record for the ledger
    const adminTxn = new Transaction({
      userId: user._id,
      type: action === "credit" ? "deposit" : "withdraw",
      amount: numericAmount,
      status: "approved", // Automatically approved since it is a manual admin action
      remarks: `Admin Adjustment: ${remarks || 'No reason provided'}`,
      settledAt: Date.now()
    });
    
    await adminTxn.save();

    req.flash("success", `Successfully ${action}ed ₹${numericAmount} to ${user.username}'s wallet.`);
    res.redirect("/admin?tab=UserManagement");

  } catch (error) {
    console.error("Error adjusting user balance:", error);
    req.flash("error", "Failed to adjust user balance.");
    res.redirect("/admin?tab=UserManagement");
  }
};

module.exports.toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Find the user in the database
    const user = await User.findById(id);
    
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/admin?tab=UserManagement");
    }

    // 2. Toggle the boolean value (if true becomes false, if false becomes true)
    user.isBlocked = !user.isBlocked;
    
    // 3. Save the update
    await user.save();

    // 4. Send success message
    const statusWord = user.isBlocked ? "suspended" : "activated";
    // Note: passport-local-mongoose adds 'username' automatically, so user.username works!
    req.flash("success", `User ${user.username} has been ${statusWord}.`);
    res.redirect("/admin?tab=UserManagement");

  } catch (error) {
    console.error("Error toggling user status:", error);
    req.flash("error", "Failed to update user status.");
    res.redirect("/admin?tab=UserManagement");
  }
}

module.exports.createUser = async (req, res) => {
    try {
        const { name, username, password, contactNumber, role, balance } = req.body;

        // 1. Create the base user object (excluding the password)
        const newUser = new User({
            name: name,
            username: username, 
            contactNumber: contactNumber,
            role: role || "user",
            balance: parseFloat(balance) || 0
        });

        // 2. Use the passport-local-mongoose register method to hash the password and save
        await User.register(newUser, password);

        // 3. If they were given a starting balance, you might want to create a Transaction record for the ledger!
        if (parseFloat(balance) > 0) {
            const adminTxn = new Transaction({
                userId: newUser._id,
                type: "deposit",
                amount: parseFloat(balance),
                status: "approved",
                remarks: "Initial Account Funding by Admin",
                settledAt: Date.now()
            });
            await adminTxn.save();
        }

        req.flash("success", `Account for ${username} created successfully!`);
        res.redirect("/admin?tab=UserManagement");

    } catch (error) {
        console.error("Error creating user:", error);
        
        // Handle duplicate username errors gracefully
        if (error.name === 'UserExistsError') {
            req.flash("error", "That username is already taken. Please choose another.");
        } else {
            req.flash("error", "Failed to create user account.");
        }
        
        res.redirect("/admin?tab=UserManagement");
    }
};

module.exports.replyToComplaint = async (req, res) => {
    try {
        const { status, adminReply } = req.body;
        
        // Find the complaint and update it
        await Complaint.findByIdAndUpdate(req.params.id, {
            status: status,
            adminReply: adminReply.trim()
        });

        req.flash('success', `Ticket updated successfully.`);
        res.redirect('/admin?tab=Complaints');
        
    } catch (err) {
        console.error(err);
        req.flash('error', `Failed to update ticket.`);
        res.redirect('/admin/complaints');
    }
};

module.exports.updateComboMarket = async (req, res) => {
    try {
        const { eventId, sessionId } = req.params;
        const { status, result } = req.body;

        // 1. Fetch the specific combo session
        const session = await Session.findById(sessionId);
        
        if (!session || !session.isCombo) {
            req.flash('error', 'Combo market not found.');
            return res.redirect('back');
        }

        // 2. Update the primary market status and result
        session.status = status;
        
        // If the admin selected "Open" (which sends an empty string), set it back to null
        session.result = result === "" ? null : result;

        // 3. Update the individual combo legs dynamically
        // The form sends them as legStatus_0, legStatus_1, etc.
        session.comboLegs.forEach((leg, index) => {
            const submittedLegStatus = req.body[`legStatus_${index}`];
            if (submittedLegStatus) {
                leg.status = submittedLegStatus;
            }
        });

        // 4. Save the updated document to the database
        await session.save();

        // 5. Provide feedback and redirect back to the management dashboard
        req.flash('success', `${session.name} updated successfully.`);
        res.redirect(`/admin/event/${eventId}/manage`);

    } catch (err) {
        console.error("Error updating combo market:", err);
        req.flash('error', 'Something went wrong while updating the combo.');
        res.redirect('back');
    }
};


module.exports.addWhatsAppNumber = async (req, res) => {
    try {
        const { phoneNumber, purpose, status, activeUntil } = req.body;
        await WhatsappNumber.create({ phoneNumber, purpose, status, activeUntil });
        req.flash('success', 'WhatsApp number added successfully!');
        res.redirect('/admin?tab=WhatsApp');
    } catch (err) {
        console.error('Error adding number:', err);
        req.flash('error', 'Failed to add number. Make sure the number is unique.');
        res.redirect('/admin?tab=WhatsApp');
    }
};

module.exports.editWhatsAppNumber = async (req, res) => {
    try {
        const { phoneNumber, purpose, status, activeUntil } = req.body;
        await WhatsappNumber.findByIdAndUpdate(req.params.id, {
            phoneNumber, purpose, status, activeUntil
        });
        req.flash('success', 'WhatsApp number updated successfully!');
        res.redirect('/admin?tab=WhatsApp');
    } catch (err) {
        console.error('Error updating number:', err);
        req.flash('error', 'Failed to update number.');
        res.redirect('/admin?tab=WhatsApp');
    }
};

module.exports.deleteWhatsAppNumber = async (req, res) => {
    try {
        await WhatsappNumber.findByIdAndDelete(req.params.id);
        req.flash('success', 'WhatsApp number deleted.');
        res.redirect('/admin?tab=WhatsApp');
    } catch (err) {
        console.error('Error deleting number:', err);
        req.flash('error', 'Failed to delete number.');
        res.redirect('/admin?tab=WhatsApp');
    }
};

module.exports.createAnnouncement = async (req, res) => {
    try {
        const { message, theme } = req.body;

        // Deactivate all existing announcements first (enforcing the "only 1 active" rule)
        await Announcement.updateMany({}, { isActive: false });

        // Create the new one (isActive defaults to true in your schema)
        await Announcement.create({
            message,
            theme,
            isActive: true 
        });

        req.flash('success', 'Announcement broadcasted successfully!');
        res.redirect('/admin?tab=Dashboard'); // Adjust redirect to where your dashboard is
    } catch (err) {
        console.error('Error creating announcement:', err);
        req.flash('error', 'Failed to broadcast announcement.');
        res.redirect('/admin?tab=Dashboard');
    }
};

// 2. Toggle Active Status
module.exports.toggleAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        const announcement = await Announcement.findById(id);

        if (!announcement) {
            req.flash('error', 'Announcement not found.');
            return res.redirect('/admin?tab=Dashboard');
        }

        if (announcement.isActive) {
            // If it's currently active, just turn it off
            announcement.isActive = false;
            await announcement.save();
            req.flash('success', 'Announcement deactivated.');
        } else {
            // If we are turning it ON, we must turn all others OFF first
            await Announcement.updateMany({}, { isActive: false });
            announcement.isActive = true;
            await announcement.save();
            req.flash('success', 'Announcement activated.');
        }

        res.redirect('/admin?tab=Dashboard');
    } catch (err) {
        console.error('Error toggling announcement:', err);
        req.flash('error', 'Failed to toggle status.');
        res.redirect('/admin?tab=Dashboard');
    }
};

// 3. Delete Announcement
module.exports.deleteAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        await Announcement.findByIdAndDelete(id);
        
        req.flash('success', 'Announcement deleted.');
        res.redirect('/admin?tab=Dashboard');
    } catch (err) {
        console.error('Error deleting announcement:', err);
        req.flash('error', 'Failed to delete announcement.');
        res.redirect('/admin?tab=Dashboard');
    }
};