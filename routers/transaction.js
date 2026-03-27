const express = require("express");
const router = express.Router();

const { isLoggedIn , isNotDemo , isNotBlocked} = require("../middleware.js")
const transactionController = require("../controllers/transaction.js");

router.get("/deposit/history" , isLoggedIn, isNotDemo, transactionController.renderDepositHistory);
router.get("/withdraw/history" , isLoggedIn, isNotDemo, transactionController.renderWithdrawHistory);
router.get("/deposit" , isLoggedIn, transactionController.renderDepositPage);
router.get("/withdraw" , isLoggedIn, transactionController.renderWithdrawPage);
router.post("/deposit" , isLoggedIn, isNotDemo, isNotBlocked, transactionController.deposit);
router.post("/withdraw" , isLoggedIn, isNotDemo,isNotBlocked, transactionController.withdraw);


module.exports = router;
