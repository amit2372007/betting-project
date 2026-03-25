const mongoose = require('mongoose');

const WalletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  balance: {
    type: Number,
    default: 0
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Wallet', WalletSchema);