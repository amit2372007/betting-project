const mongoose = require('mongoose');

const whatsappNumberSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    // Suggestion: store in standard E.164 format, e.g., "+919876543210"
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'banned', 'cooldown'],
    default: 'inactive'
  },
  activeFrom: {
    type: Date,
    required: true,
    default: Date.now
  },
  activeUntil: {
    type: Date,
    required: true,
    // Example: Number expires/rotates after 2 hours
  },
  purpose: {
    type: String,
    enum: ['support', 'deposit', 'withdrawal', 'general'],
    default: 'general'
  },
  messageCount: {
    type: Number,
    default: 0
    // Useful for tracking usage to prevent WhatsApp bans
  }
}, { timestamps: true });

// Compound index to quickly query for available, unexpired numbers
whatsappNumberSchema.index({ status: 1, activeUntil: 1 });

const WhatsappNumber = mongoose.model('WhatsappNumber', whatsappNumberSchema);

module.exports = WhatsappNumber;