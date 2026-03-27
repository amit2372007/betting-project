const mongoose = require('mongoose');

const exposureSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true 
  },
  matchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    required: true,
    index: true
  },
  // Using a Map allows dynamic keys. 
  // Key = teamId/runnerId, Value = Profit/Loss for that outcome
  exposures: {
    type: Map,
    of: Number, 
    default: {}
  },
  // The absolute worst-case scenario (max potential loss)
  // This is the exact amount locked from the user's main wallet balance.
  liability: {
    type: Number,
    default: 0,
    max: 0 // Liability should always be 0 or a negative number
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'SETTLED', 'VOID'],
    default: 'ACTIVE'
  }
}, { timestamps: true });

// Compound index to quickly find a specific user's exposure for a specific match
exposureSchema.index({ userId: 1, matchId: 1 }, { unique: true });

module.exports = mongoose.model('Exposure', exposureSchema);