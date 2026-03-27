const mongoose = require("mongoose");

const LedgerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },

  // Covers all internal wallet movements related to betting and admin adjustments
  type: {
    type: String,
    enum: [
      "bet_placed",      // Money deducted for placing a bet
      "bet_won",         // Money added for winning a bet
      "refund",          // Money returned (voided match)
      "admin_adjustment", // You manually added/removed funds
      "refund"
    ],
    required: true
  },

  // The exact amount that moved.
  amount: {
    type: Number,
    required: true,
    min: 0 
  },

  // The crucial Passbook feature: snapshot of the wallet before and after
  balanceBefore: {
    type: Number,
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true
  },

  // Direct link to the exact Bet this ledger entry belongs to
  betId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Bet",
    required: true
  },

  // Human-readable receipt 
  remarks: {
    type: String,
    required: true
  }

}, { 
  timestamps: true 
});

/* =======================================================
   PERFORMANCE INDEX
   ======================================================= */
// For instantly loading a user's bet history/passbook
LedgerSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("Ledger", LedgerSchema);