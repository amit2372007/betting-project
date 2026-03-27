const User = require("../model/user/user.js");
const Event = require("../model/event/event.js");
const Bet = require("../model/bet/bet.js");
const Transaction = require("../model/transactions/transaction.js");
const Session = require("../model/event/session.js");
const Complaint = require("../model/complain/complain.js");
const DepositAccount = require("../model/transactions/accountDetail.js");
const WhatsappNumber = require("../model/transactions/whatsapp.js");
const Announcement = require("../model/user/announcement.js");

module.exports.renderAdminDashboard = async (req, res) => {
  try {
    const activeTab = req.query.tab || "Dashboard";

    // NEW: Fetch all users for the User Management tab
    const users = await User.find().sort({ createdAt: -1 }).lean();
    
    // 1. Fetch Events
    const activeEvents = await Event.find({ status: { $ne: "settled" } }).sort({ startTime: 1 }).lean();
    const liveEvents = activeEvents.filter(event => event.status === "live");
    const upcomingEvents = activeEvents.filter(event => event.status === "pending" || event.status === "upcoming");

    // 2. Fetch ALL Deposits & Populate User Data
    const deposits = await Transaction.find({ type: "deposit" })
      .sort({ createdAt: -1 })
      .populate("userId", "username email") // Pulls in the username for the table
      .lean();

    // 3. Fetch ALL Withdrawals & Populate User Data
    const withdrawals = await Transaction.find({ type: "withdraw" })
      .sort({ createdAt: -1 })
      .populate("userId", "username email")
      .lean();

    const totalUsers = await User.countDocuments();

    // 4. Calculate Financial Stats for the Top Cards
    // Get start of today for "Total Deposits (Today)"
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const totalDepositsToday = deposits
      .filter(d => d.status === "approved" && new Date(d.createdAt) >= startOfToday)
      .reduce((sum, d) => sum + d.amount, 0);

    const totalApprovedAmount = deposits
      .filter(d => d.status === "approved")
      .reduce((sum, d) => sum + d.amount, 0);

      let complaints = [];
      let stats = { open: 0, inProgress: 0, resolvedToday: 0 };

      complaints = await Complaint.find()
                .populate('userId', 'name _id')
                .sort({ createdAt: -1 })
                .lean();

            stats.open = complaints.filter(c => c.status === 'Open').length;
            stats.inProgress = complaints.filter(c => c.status === 'In Progress').length;
            
            const today = new Date().setHours(0, 0, 0, 0);
            stats.resolvedToday = complaints.filter(c => 
                c.status === 'Resolved' && new Date(c.updatedAt) >= today
            ).length;


    //Whatsapp Number mange
    const whatsappNumbers = await WhatsappNumber.find().sort({ createdAt: -1 });
    const announcements = await Announcement.find({});

    req.flash("success", "Welcome Amit to the Admin Dashboard!");
    // 5. Render Dashboard
    res.render("./admin/dashboard.ejs", { 
      activeTab, 
      users,
      complaints: complaints,
      stats: stats,
      activeEvents, 
      liveEvents, 
      upcomingEvents,
      deposits,            // Replaces pendingDeposits
      withdrawals,         // Replaces pendingWithdrawals
      totalUsers,
      totalDepositsToday,  // Dynamic stat
      totalApprovedAmount,  // Dynamic stat
      whatsappNumbers: whatsappNumbers,
      announcements,
    });

  } catch (err) {
    console.error("Error loading admin dashboard:", err);
    req.flash("error", "Failed to load admin dashboard.");
    return res.redirect("/home"); // or wherever your fallback route is
  }
}

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
    console.log("Fetched Event for Admin:", event);
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
    const {
      sport,
      league,
      event_id,
      start_time,
      status,
      providerId,
      home_team,
      home_id,
      away_team,
      away_id,
      odds_home,
      odds_away,
      odds_draw,
      toss_home,
      toss_away
    } = req.body;

    // 2. Map the form data to your Mongoose schema structure
    const newEvent = new Event({
      sport: sport,
      league: league,
      eventId: event_id,         // Mapping HTML 'event_id' to Schema 'eventId'
      homeTeam: home_team,
      homeId: home_id,
      awayTeam: away_team,
      awayId: away_id,
      startTime: start_time,     // Mapping HTML 'start_time' to Schema 'startTime'
      status: status,
      providerId: providerId,
      
      // We parse the odds as Floats since form inputs send strings by default
      matchOdds: {
        homeOdds: parseFloat(odds_home) || 0,
        awayOdds: parseFloat(odds_away) || 0,
        drawOdds: parseFloat(odds_draw) || 0,
        status: "active" 
      },
      
      tossMarket: {
        homeOdds: parseFloat(toss_home) || 0,
        awayOdds: parseFloat(toss_away) || 0,
        status: "active",
        winner: null
      }
    });
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

    req.flash("success", "Event status updated successfully!");
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
    const { homeOdds, drawOdds, awayOdds, marketStatus } = req.body;

    const resolvedStatus = marketStatus === "active" ? "active" : "suspended";

    // Update the database
    const updatedEvent = await Event.findByIdAndUpdate(
      id,
      {
        "matchOdds.homeOdds": parseFloat(homeOdds) || 0,
        "matchOdds.drawOdds": parseFloat(drawOdds) || 0,
        "matchOdds.awayOdds": parseFloat(awayOdds) || 0,
        "matchOdds.status": resolvedStatus
      },
      { new: true } // Return the updated document
    );

    if (!updatedEvent) {
      req.flash("error", "Event not found");
      return res.redirect("/admin?tab=Dashboard");
    }
    req.flash("success", "Match odds updated successfully!");
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
    const { homeTossOdds, awayTossOdds, tossStatus, tossWinner } = req.body;

    const resolvedWinner = tossWinner === "" ? null : tossWinner;

    const updatedEvent = await Event.findByIdAndUpdate(
      id,
      {
        "tossMarket.homeOdds": parseFloat(homeTossOdds) || 0,
        "tossMarket.awayOdds": parseFloat(awayTossOdds) || 0,
        "tossMarket.status": tossStatus,
        "tossMarket.winner": resolvedWinner
      },
      { new: true } 
    );

    if (!updatedEvent) {
      req.flash("error", "Event not found");
      return res.redirect("/admin?tab=Dashboard");
    }

    req.flash("success", "Toss market updated successfully!");
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