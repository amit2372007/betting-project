const mongoose = require("mongoose");

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
      const noEventGames = ['casino_mines', 'vso_next_ball', 'vso_match_winner', 'aviator_crash' , 'chicken_road'];
      return !noEventGames.includes(this.marketType); 
    }
  },

  // Direct link to the Session.
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Session"
  },
  
  // Denormalized field for fast history loading
  eventName: String, 

  type: {
    type: String,
    enum: ["back", "lay" , "casino"],
    required: true
  },
  
  marketType: { 
    type: String, // e.g., "match_odds", "toss", "session", "aviator_crash"
    required: true
  },
  
  selection: {
    type: String,
    required: true
  },

  odds: { 
    type: Number, 
    // Odds are decided dynamically at cashout in Aviator, so bypass upfront validation
    required: function() { 
      const noOddsGames = ['casino_mines', 'vso_next_ball', 'vso_match_winner', 'aviator_crash' , 'chicken_road'];
      return !noOddsGames.includes(this.marketType); 
    }
  }, 
  
  stake: { type: Number, required: true, min: 10 }, // Min bet ₹10
  
  potentialWin: { 
    type: Number, 
    // Potential win is unknown until the plane crashes or user cashes out
    required: function() { 
      const noWinGames = ['casino_mines', 'vso_next_ball', 'vso_match_winner', 'aviator_crash' , 'chicken_road'];
      return !noWinGames.includes(this.marketType); 
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
  // Mongoose automatically manages createdAt and updatedAt
  timestamps: true 
});

// 1. For lighting-fast Session Settlement
BetSchema.index({ sessionId: 1, status: 1 });

// 2. For lighting-fast Match Settlement
BetSchema.index({ eventId: 1, status: 1 });

// 3. For instantly loading a user's pending or settled bet history
BetSchema.index({ userId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("Bet", BetSchema);