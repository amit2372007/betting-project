const mongoose = require("mongoose");

// ✅ Define this ONCE at the top
const NO_ODDS_GAMES = ['casino_mines', 'vso_next_ball', 'vso_match_winner', 'aviator_crash', 'chicken_road', '7up_7down'];

const BetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: function() { 
      // Bypass eventId requirement for Casino and Virtual games
      return !NO_ODDS_GAMES.includes(this.marketType); 
    }
  },

  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Session"
  },
  
  eventName: String, 

  type: {
    type: String,
    enum: ["back", "lay", "casino"], // Added casino
    required: true
  },
  
  marketType: { 
    type: String, 
    required: true
  },
  
  selection: {
    type: String,
    required: true
  },

  odds: { 
    type: Number, 
    required: function() { 
      return !NO_ODDS_GAMES.includes(this.marketType); 
    }
  }, 
  
  stake: { type: Number, required: true, min: 10 },
  
  potentialWin: { 
    type: Number, 
    required: function() { 
      return !NO_ODDS_GAMES.includes(this.marketType); 
    }
  },

  status: {
    type: String,
    enum: ["pending", "won", "lost", "void"],
    default: "pending"
  },
  
  payout: { type: Number, default: 0 },
  settledAt: Date

}, { 
  timestamps: true 
});

// 1. For lightning-fast Session Settlement
BetSchema.index({ sessionId: 1, status: 1 });

// 2. For lightning-fast Match Settlement
BetSchema.index({ eventId: 1, status: 1 });

// 3. For instantly loading a user's pending or settled bet history
BetSchema.index({ userId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("Bet", BetSchema);