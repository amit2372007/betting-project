const express = require("express");
const router = express.Router();

const { isLoggedIn , isAdmin } = require("../middleware.js");
const casinoController = require("../controllers/casino.js");

router.get("/fruit-bonanza" ,isLoggedIn, casinoController.renderFruitBonanza);
router.get("/7up-7down" , isLoggedIn, casinoController.render7Up7Down);
router.get("/vso", isLoggedIn, casinoController.renderVirtualSuperOver);
router.get("/aviator",isLoggedIn, casinoController.renderAviator);
router.get("/diamond-and-mines", isLoggedIn, casinoController.renderDiamondMines);
router.get("/chicken-road" , isLoggedIn , casinoController.renderChickenRoad);




module.exports = router;