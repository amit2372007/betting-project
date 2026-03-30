const Transaction = require("../model/transactions/transaction.js");
const User = require("../model/user/user.js");
const DepositAccount = require("../model/transactions/accountDetail.js");
const WhatsaapNumber = require("../model/transactions/whatsapp.js");

module.exports.renderDepositHistory = async (req, res) => {
  try {
    if (!req.user) {
      req.flash("error", "Please Login!");
      return res.redirect("/user/login");
    }
    const userDeposit = await Transaction.find({
      userId: req.user._id,
      type: "deposit",
    });
    res.render("./user/depositHistory.ejs", { userDeposit });
  } catch (err) {
    req.flash("error", `error: ${err}`);
    res.redirect("/home");
  }
};

module.exports.renderWithdrawHistory = async (req, res) => {
  try {
    if (!req.user) {
      req.flash("error", "Please Login!");
      return res.redirect("/user/login");
    }
    const userWithdraw = await Transaction.find({
      userId: req.user._id,
      type: "withdraw",
    });
    res.render("./user/withdrawHistory.ejs", { userWithdraw });
  } catch (err) {
    req.flash("error", `error: ${err}`);
    res.redirect("/home");
  }
};

module.exports.renderDepositPage = async (req, res) => {
  try {
    if (!req.user) {
      req.flash("error", "Please Login!");
      return res.redirect("/user/login");
    }
    const depositAccounts = await DepositAccount.find({ isActive: true });
    const whatsaapNumber = await WhatsaapNumber.find({purpose: "support"});
    res.render("./user/deposit.ejs", { depositAccounts , whatsaapNumber});
  } catch (err) {
    req.flash("error", `error: ${err}`);
    res.redirect("/home");
  }
};

module.exports.deposit = async (req, res) => {
  try {
    if (!req.user) {
      req.flash("error", "Please login to request a deposit.");
      return res.redirect("/home");
    }

    const { transactionId, amount } = req.body;
    const depositAmount = Number(amount);

    // 1. Validation: Minimum/Maximum checks
    if (depositAmount < 100 || depositAmount > 100000) {
      req.flash("error", "Deposit amount must be between ₹100 and ₹1,00,000.");
      return res.redirect("/transaction/deposit");
    }

    // 2. Validation: Balance check
    // We find the user again to get the latest balance
    const user = await User.findById(req.user._id);
    
    // 3. Create Transaction Request
    const newTransaction = new Transaction({
      userId: req.user._id,
      type: "deposit",
      amount: depositAmount,
      transactionId: transactionId,
      status: "pending", // Stays pending until Admin approval
    });
    await newTransaction.save();

    req.flash("success", "Deposit request submitted successfully!");
    res.redirect("/home");
  } catch (err) {
    req.flash("error", `System Error: ${err.message}`);
    res.redirect("/home");
  }
};

module.exports.withdraw = async (req, res) => {
  try {
    if (!req.user) {
      req.flash("error", "Please login to request a withdrawal.");
      return res.redirect("/home");
    }

    const { amount, bankDetails } = req.body;
    const withdrawAmount = Number(amount);

    // 1. Validation: Minimum/Maximum checks
    if (withdrawAmount < 3000 || withdrawAmount > 100000) {
      req.flash(
        "error",
        "Withdrawal amount must be between ₹3,000 and ₹1,00,000.",
      );
      req.flash("error" , "Note: Minimum withdrawal amount is ₹3,000 to ensure transaction viability.");
      return res.redirect("/home");
    }

    // 2. Validation: Balance check
    // We find the user again to get the latest balance
    const user = await User.findById(req.user._id);
    if (user.balance < withdrawAmount) {
      req.flash("error", "Insufficient balance for this request.");
      return res.redirect("/transaction/withdraw");
    }

    req.user.balance -= withdrawAmount;

    // 3. Create Transaction Request
    const newTransaction = new Transaction({
      userId: req.user._id,
      type: "withdraw",
      amount: withdrawAmount,
      bankDetails: {
        holderName: bankDetails.holderName,
        accountNumber: bankDetails.accountNumber,
        ifscCode: bankDetails.ifscCode,
      },
      status: "pending", // Stays pending until Admin approval
    });
    await req.user.save();
    await newTransaction.save();

    req.flash("success", "Withdrawal request submitted successfully!");
    res.redirect("/home");
  } catch (err) {
    req.flash("error", `System Error: ${err.message}`);
    res.redirect("/home");
  }
};

module.exports.renderWithdrawPage = async (req, res) => {
  try {
    if (!req.user) {
      req.flash("error", "Please Login!");
      return res.redirect("/user/login");
    }
    res.render("./user/withdraw.ejs");
  } catch (err) {
    req.flash("error", `error: ${err}`);
    res.redirect("/home");
  }
};

