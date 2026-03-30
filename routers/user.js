const express = require("express");
const router = express.Router();
const passport = require("passport");
const { isLoggedIn, isNotBlocked } = require("../middleware.js"); 
const userController = require("../controllers/user.js");

router.get("/login", userController.renderLogin);
router.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) {
      return next(err); // Handles server-side logout errors
    }
    req.flash("success", "You have logged out successfully!");
    res.redirect("/home");
  });
});
router.get("/accountStatements", isLoggedIn, userController.renderAccountStatements);
router.get('/demo-login', userController.demoLogin);
router.get("/change-password", isLoggedIn, userController.renderChangePassword);
router.get("/support" , isLoggedIn, userController.renderUserSupport);
router.post("/support/complaint", isLoggedIn, userController.submitComplaint);
router.post('/change-password', isLoggedIn, userController.changePassword);
router.post("/login", isNotBlocked, (req, res, next) => {
  // 1. Call passport.authenticate with a custom callback function
  passport.authenticate("local", (err, user, info) => {
    
    // 2. Handle Server/Database Errors
    if (err) {
      console.error("Login Error:", err);
      req.flash("error", "An internal server error occurred.");
      return next(err); 
    }

    // 3. Handle Authentication Failure (Wrong password, user not found, etc.)
    // 'info' contains the exact error message from passport-local-mongoose!
    if (!user) {
      // info.message will usually say "Password or username is incorrect"
      const errorMessage = info ? info.message : "Invalid username or password.";
      req.flash("error", errorMessage);
      return res.redirect("/user/login");
    }

    // 4. Manually log the user in if authentication was successful
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error("Session Error:", loginErr);
        req.flash("error", "Failed to create a login session.");
        return next(loginErr);
      }

      // Success!
      req.flash("success", `Welcome back, ${user.name}!`);
      return res.redirect("/home");
    });

  })(req, res, next); // <-- Don't forget this immediately invoked function syntax!
});


module.exports = router;