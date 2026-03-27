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
router.post("/login" ,isNotBlocked, passport.authenticate("local", {
    failureRedirect: "/user/login",
    failureFlash: true,
  }),
  (req, res) => {
    req.flash("success", `Welcome back, ${req.user.name}!`);
    res.redirect("/home");
  },
);


module.exports = router;