const mongoose = require("mongoose");

const ComplaintSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  
  // A readable tracking ID for the user (e.g., "TKT-98231")
  ticketId: {
    type: String,
    required: true,
    unique: true
  },

  // Categorizing helps you filter them in the admin panel
  category: {
    type: String,
    enum: [
      "Deposit Issue", 
      "Withdrawal Issue", 
      "Bet Settlement", 
      "Technical Bug", 
      "Other"
    ],
    required: true
  },

  // Optional: If they are complaining about a specific bet or transaction, 
  // they can paste the ID here.
  referenceId: {
    type: String,
    trim: true
  },

  subject: {
    type: String,
    required: true,
    trim: true,
    maxLength: 100
  },

  description: {
    type: String,
    required: true,
    maxLength: 1000
  },

  // Tracking the lifecycle of the ticket
  status: {
    type: String,
    enum: ["Open", "In Progress", "Resolved", "Closed"],
    default: "Open"
  },

  // Where you (the admin) leave your resolution message
  adminReply: {
    type: String,
    default: ""
  },

  // Optional: If you eventually want to let them upload screenshots
  attachments: [{
    type: String 
  }]

}, { 
  timestamps: true 
});

// Performance index for quickly loading a user's past tickets
ComplaintSchema.index({ userId: 1, createdAt: -1 });
// Index for the admin panel to quickly find open tickets
ComplaintSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Complaint", ComplaintSchema);