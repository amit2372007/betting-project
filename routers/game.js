const express = require("express");
const router = express.Router();

const { isLoggedIn , isAdmin } = require("../middleware.js");
const gameController = require("../controllers/game.js");



router.post('/slots/spin', isLoggedIn, gameController.slotsSpin);
router.post('/7up7down/roll', isLoggedIn, gameController.sevenUp7DownRoll);
router.post("/aviator/bet", isLoggedIn, gameController.aviatorPlaceBet);
router.post("/aviator/cashout", isLoggedIn, gameController.aviatorCashout);
router.post("/mines/cashout", isLoggedIn, gameController.cashoutMinesGame);
router.post("/mines/start", isLoggedIn, gameController.startMinesGame);
router.post("/mines/reveal", isLoggedIn , gameController.revealMinesCell);
router.post('/chicken-road/start', gameController.startGame);
router.post('/chicken-road/step', gameController.takeStep);
router.post('/chicken-road/cashout', gameController.cashOut);

module.exports = router;