const express = require("express");
const router = express.Router();

const { isLoggedIn , isNotDemo} = require("../middleware.js")
const transactionController = require("../controllers/transaction.js");

router.get("/deposit/history" , isLoggedIn, isNotDemo, transactionController.renderDepositHistory);
router.get("/withdraw/history" , isLoggedIn, isNotDemo, transactionController.renderWithdrawHistory);
router.get("/deposit" , isLoggedIn, transactionController.renderDepositPage);
router.get("/withdraw" , isLoggedIn, transactionController.renderWithdrawPage);
router.post("/deposit" , isLoggedIn, isNotDemo, transactionController.deposit);
router.post("/withdraw" , isLoggedIn, isNotDemo, transactionController.withdraw);


module.exports = router;
