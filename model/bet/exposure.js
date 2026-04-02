const mongoose = require('mongoose');

const exposureSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true 
  },
  // 🌟 FIX 1 & 2: Changed to eventId and ref to 'Event'
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event', 
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
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'SETTLED', 'VOID', 'PROCESSING'],
    default: 'ACTIVE'
  }
}, { timestamps: true });

// 🌟 FIX 3: Updated compound index to use eventId
exposureSchema.index({ userId: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.model('Exposure', exposureSchema);