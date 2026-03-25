const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  type: {
    type: String,
    enum: ["deposit", "withdraw"],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: [100, "Minimum transaction amount is ₹100"]
  },
  // Bank details specifically for Withdrawals
  bankDetails: {
    holderName: String,
    accountNumber: String,
    ifscCode: String,
  },
  // Payment proof (e.g., ImageKit URL) for Deposits
  paymentProof: {
    url: String,
    fileId: String
  },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },
  transactionId: {
    type: String,
    unique: true,
    // Generates a unique ID like TXN-EX774921-170685
    default: () => `TXN-${Math.floor(100000 + Math.random() * 900000)}`
  },
  remarks: String, // Reason for rejection or admin notes
  createdAt: {
    type: Date,
    default: Date.now
  },
  settledAt: Date
});

module.exports = mongoose.model("Transaction", TransactionSchema);