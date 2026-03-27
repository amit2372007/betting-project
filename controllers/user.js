const User = require("../model/user/user.js");
const Complaint = require("../model/complain/complain.js");
const Bet = require("../model/bet/bet.js");
const Transaction = require("../model/transactions/transaction.js");
const Ledger = require("../model/user/ledger.js");
const WhatsappNumber = require("../model/transactions/whatsapp.js");

module.exports.renderLogin = async(req, res)=>{
    try{
      const whatsaapNumber =  await WhatsappNumber.findOne({purpose: "deposit"});
      res.render("./user/login.ejs" , {whatsaapNumber});
    } catch(err) {
      req.flash("error" , "Failed to Load Login Page!");
      res.redirect("/user/login");
    }   
};

module.exports.demoLogin = async (req, res, next) => {
    try {
        const demoUser = await User.findOne({ username: 'demo' });

        // 2. Safety check: What if the demo user was deleted?
        if (!demoUser) {
            return res.status(404).send("Demo account not found. Please create a user with username 'demo' first.");
        }

        // 3. Manually log the user in (Bypasses password check!)
        // req.login is provided by Passport.js to establish the session
        req.login(demoUser, (err) => {
            if (err) {
                console.error("Demo Login Error:", err);
                return next(err);
            }
            
            // 4. Redirect them straight to the casino lobby
            return res.redirect('/home'); // Change this to your actual lobby route if different
        });

    } catch (err) {
        console.error("Server error during demo login:", err);
        res.status(500).send("Internal Server Error");
    }
};

module.exports.renderChangePassword = (req, res) => {
    res.render("./user/change-password.ejs");
};

module.exports.changePassword = async (req, res) => {
    try {
        // 1. Strict Security: Must be logged in
        if (!req.user || !req.user._id) {
            return res.status(401).json({ success: false, error: 'Unauthorized. Please log in.' });
        }

        const { currentPassword, newPassword, confirmPassword } = req.body;

        // 2. Validation Checks
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ success: false, error: 'All fields are required.' });
        }
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ success: false, error: 'New passwords do not match.' });
        }
        if (newPassword.length < 8) {
            return res.status(400).json({ success: false, error: 'Password must be at least 8 characters.' });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found.' });
        }

        // 3. Change Password using Passport-Local-Mongoose built-in method
        user.changePassword(currentPassword, newPassword, (err) => {
            if (err) {
                // Passport returns an error if the current password is wrong
                if (err.name === 'IncorrectPasswordError') {
                    return res.status(400).json({ success: false, error: 'Incorrect current password.' });
                }
                console.error("Password Change Error:", err);
                return res.status(500).json({ success: false, error: 'Failed to update password.' });
            } 
        });
     req.flash("success", "Password changed successfully!");
    res.redirect("/home?tab=Profile");
    } catch (err) {
        console.error("Server Error Changing Password:", err);
        res.status(500).json({ success: false, error: 'Internal server error.' });
    }
};

module.exports.renderUserSupport = async (req, res) => {
    try {
        if (!req.user) {
            req.flash("error", "Please login to access support.");
            return res.redirect("/home");
        }

        // Fetch the user's past tickets so they can see the status of their complaints
        const myTickets = await Complaint.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .lean();

        res.render("./webpage/support.ejs", { 
            user: req.user,
            tickets: myTickets
        });

    } catch (err) {
        console.error("Error loading support page:", err);
        req.flash("error", "Failed to load support page.");
        res.redirect("/home");
    }
};

module.exports.submitComplaint = async (req, res) => {
    try {
        // 1. Ensure the user is logged in
        if (!req.user) {
            req.flash("error", "Please login to submit a support ticket.");
            return res.redirect("/home");
        }

        // 2. Extract the data sent from the EJS form
        const { category, referenceId, subject, description } = req.body;

        // 3. Generate a clean, unique Ticket ID (e.g., TKT-8492)
        // Using Math.random combined with a string prefix looks very professional
        const randomNumbers = Math.floor(1000 + Math.random() * 9000);
        const newTicketId = `TKT-${randomNumbers}`;

        // 4. Create the new document using your Mongoose schema
        const newComplaint = new Complaint({
            userId: req.user._id,
            ticketId: newTicketId,
            category: category,
            // referenceId is optional in your form, so we provide a fallback
            referenceId: referenceId ? referenceId.trim() : "", 
            subject: subject.trim(),
            description: description.trim(),
            status: "Open" // Default status
        });

        // 5. Save it to MongoDB
        await newComplaint.save();

        // 6. Send a success message and redirect
        req.flash("success", `Ticket ${newTicketId} created successfully. Our team will review it shortly.`);
        
        // Redirecting with ?tab=history tells the frontend JS to automatically show the Past Tickets list!
        res.redirect("/support?tab=history");

    } catch (err) {
        console.error("Error submitting complaint:", err);
        req.flash("error", "Failed to submit your complaint. Please try again.");
        res.redirect("/support");
    }
};

module.exports.renderAccountStatements = async (req, res) => {
    try {
        if (!req.user) {
            req.flash("error", "Please login to view your account statements.");
            return res.redirect("/home");
        } 

        // 1. Fetch External Transactions
        const externalTxns = await Transaction.find({ userId: req.user._id }).lean();

        // 2. Fetch Internal Ledger
        const ledgerEntries = await Ledger.find({ userId: req.user._id })
            .populate('betId', 'eventName selection marketType') 
            .lean();

        // 3. FETCH LOST BETS
        const lostBets = await Bet.find({ userId: req.user._id, status: "lost" }).lean();
        
        // Format the lost bets
        const formattedLostBets = lostBets.map(bet => ({
            _id: bet._id,
            type: 'bet_lost',
            amount: bet.stake, 
            createdAt: bet.settledAt || bet.updatedAt, 
            balanceAfter: null, 
            betId: bet, 
            remarks: `Bet Lost: ${bet.selection}`
        }));

        // 4. Merge all THREE arrays into one master statement
        const combinedStatement = [...externalTxns, ...ledgerEntries, ...formattedLostBets];

        // 5. Sort the unified array by date (Newest First)
        combinedStatement.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // ==========================================
        // 6. PAGINATION LOGIC
        // ==========================================
        const page = parseInt(req.query.page) || 1;
        const limit = 30; // Number of transactions per page
        
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        
        const totalItems = combinedStatement.length;
        const totalPages = Math.ceil(totalItems / limit);
        
        // Slice the array to only send the current page's data to the frontend
        const paginatedStatement = combinedStatement.slice(startIndex, endIndex);

        // 7. Render the UI with pagination variables
        res.render("./webpage/accountStatements.ejs", {
            user: req.user,
            statement: paginatedStatement,
            currentPage: page,
            totalPages: totalPages,
            hasNextPage: endIndex < totalItems,
            hasPrevPage: startIndex > 0
        });

    } catch (err) {   
        console.error("Error loading account statements:", err);
        req.flash("error", "Failed to load account statements.");
        res.redirect("/home");
    } 
};