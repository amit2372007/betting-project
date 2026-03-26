const mongoose = require("mongoose");
const event = require("./event");

const SessionSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true
  },
  marketId: String,         // ID from your Odds API provider
  name: String,             // e.g., "India 1st Innings 6 Overs Runs"
  value: Number,            // The line being bet on (e.g., 45.5 runs)
  yesOdds: Number,          // Odds for Over/Yes
  noOdds: Number,           // Odds for Under/No
  isCombo: {
    type: Boolean,
    default: false
  },
  comboLegs: [{
    description: String,    // e.g., "V Kohli to score 20+ Runs"
    status: {               // Track individual leg progress
        type: String,
        enum: ["pending", "won", "lost"],
        default: "pending"
    }
  }],
  status: {
    type: String,
    enum: ["active", "suspended", "settled"],
    default: "active"
  },
  category: {
    type: String,
    enum: ["toss", "match", "1st innings runs", "2nd innings runs", "total runs", "wickets", "other"],
    default: "other"
  },
  result: {
    type: String,
    enum: ["yes", "no", "void", null],
    default: null
  }
});
module.exports = mongoose.model("Session", SessionSchema);