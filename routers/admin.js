const express = require("express");
const router = express.Router();

const { isLoggedIn, isAdmin } = require("../middleware.js");
const adminController = require("../controllers/admin.js");

router.get("/", isAdmin, adminController.renderAdminDashboard);
router.get("/addEvent", isAdmin, adminController.renderAddEventPage);
router.get("/manage-payments", isAdmin, adminController.renderManagePayments);
router.get("/event/:id", adminController.renderEventDetails);
router.get("/user/:id/balance", isAdmin, adminController.renderUserManagement);
router.get("/user/:id/history", isAdmin, adminController.renderUserHistory);
router.get("/influencers", isAdmin, adminController.renderInfluencerPage);
router.post("/influencers/add", isAdmin, adminController.addInfluencer);
router.post("/manage-payments/add", isAdmin, adminController.addPaymentMethod);
router.delete(
  "/manage-payments/delete/:id",
  isAdmin,
  adminController.deletePaymentMethod,
);
router.post(
  "/manage-payments/toggle/:id",
  isAdmin,
  adminController.togglePaymentMethod,
);
router.post("/addEvent", isAdmin, adminController.addEvent);
router.post(
  "/event/:id/update-status",
  isAdmin,
  adminController.updateEventStatus,
);
router.post(
  "/event/:id/update-match-odds",
  isAdmin,
  adminController.updateMatchOdds,
);
router.post(
  "/event/:id/update-toss",
  isAdmin,
  adminController.updateTossResult,
);

router.post(
  "/event/:eventId/update-combo/:sessionId",
  isAdmin,
  adminController.updateComboMarket,
);
router.post("/event/:id/add-session", isAdmin, adminController.addSession);
router.post(
  "/event/:eventId/update-session/:sessionId",
  isAdmin,
  adminController.updateSession,
);
router.post(
  "/transaction/:id/process",
  isAdmin,
  adminController.processTransaction,
);
router.post("/user/:id/balance", isAdmin, adminController.adjustUserBalance);
router.post(
  "/user/:id/toggle-status",
  isAdmin,
  adminController.toggleUserStatus,
);
router.post("/user/create", isAdmin, adminController.createUser);
router.post("/complaint/:id/reply", isAdmin, adminController.replyToComplaint);
router.post("/whatsapp/add", isAdmin, adminController.addWhatsAppNumber);
router.post(
  "/whatsapp/update/:id",
  isAdmin,
  adminController.editWhatsAppNumber,
);
router.post(
  "/whatsapp/delete/:id",
  isAdmin,
  adminController.deleteWhatsAppNumber,
);
router.post("/announcements/create", adminController.createAnnouncement);
router.post("/announcements/toggle/:id", adminController.toggleAnnouncement);
router.post("/announcements/delete/:id", adminController.deleteAnnouncement);
module.exports = router;
