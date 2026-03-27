const User = require("./model/user/user.js");
// 1. Check if the user is logged in
module.exports.isLoggedIn = (req, res, next) => {
    // req.isAuthenticated() is automatically provided by Passport.js
    if (!req.isAuthenticated()) {
        // Optional: Save the URL they were trying to visit so you can redirect them back after login
        req.session.returnTo = req.originalUrl;
        
        req.flash("error", "You must be signed in to access this page.");
        return res.redirect("/user/login");
    }
    next(); // User is logged in, proceed to the next function/route
};

// 2. Check if the logged-in user is an Admin
module.exports.isAdmin = (req, res, next) => {
    // First, ensure they are actually logged in
    if (!req.isAuthenticated()) {
        req.flash("error", "You must be signed in first.");
        return res.redirect("/user/login");
    }

    // Second, check their role (Assuming your User model has a 'role' field that defaults to 'user')
    if (req.user.role !== 'admin') {
        req.flash("error", "Access Denied: You do not have admin privileges.");
        return res.redirect("/home"); // Kick them back to the player lobby
    }
    
    next(); // User is an admin, proceed to the admin dashboard
};

// 3. Prevent logged-in users from seeing the Login/Register pages
module.exports.isLoggedOut = (req, res, next) => {
    if (req.isAuthenticated()) {
        req.flash("info", "You are already logged in.");
        return res.redirect("/home");
    }
    next();
};

// 4. Helper to redirect users back to where they came from after logging in
module.exports.saveRedirectUrl = (req, res, next) => {
    if (req.session.returnTo) {
        res.locals.returnTo = req.session.returnTo;
    }
    next();
};

module.exports.isNotDemo = (req, res, next) => {
    // 1. Safety check: Ensure the user is actually logged in first
    if (!req.user) {
        req.flash("error", "You must be logged in.");
        return res.redirect("/");
    }

    if (req.username === "demo" || req.user.username.toLowerCase().includes("demo")) {
        
        req.flash("error", "Action restricted! Demo accounts cannot perform this action.");
        
        const redirectUrl = req.headers.referer || "/home";
        return res.redirect(redirectUrl);
    }
    next();
};

module.exports.isNotBlocked = async (req, res, next) => {
    try {
        // Grab the username (or email) from the login form submission
        const { username } = req.body;

        if (!username) {
            // If they left it blank, just let Passport handle the "missing credentials" error
            return next(); 
        }

        // Find the user in the database
        const user = await User.findOne({ username: username });

        // If the user exists AND their account is marked as blocked
        if (user && user.isBlocked === true) {
            req.flash("error", "Your account has been blocked by an Admin. Please contact support via WhatsApp.");
            return res.redirect("/user/login"); // Send them back to the login page
        }

        // If the user is not blocked, allow the login process to continue
        next();
        
    } catch (err) {
        console.error("Error in isNotBlocked middleware:", err);
        req.flash("error", "Something went wrong during login verification.");
        res.redirect("/user/login");
    }
};