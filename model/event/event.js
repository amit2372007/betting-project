const mongoose = require("mongoose");

const EventSchema = new mongoose.Schema({
  sport: String,            // football, cricket
  league: String,

  eventId: String,          // ID from Odds API
  homeTeam: String,
  awayTeam: String,
  homeId: String,
  awayId: String,
  startTime: Date,

  status: {
    type: String,
    enum: ["upcoming", "pending", "live", "finished"],
    default: "upcoming",
    required: true
  },

  result: {
    type: String,
    enum: ["home", "away", "draw", "void" , null],
    default: null
  },

  matchOdds: {
    homeOdds: { type: Number, default: 0 },
    awayOdds: { type: Number, default: 0 },
    drawOdds: { type: Number, default: 0 }, // Optional: Can be 0 or null for sports where draws aren't possible
    status: { 
      type: String, 
      enum: ["active", "suspended"], 
      default: "active" 
    }
  },

  // 2. Toss Market
  tossMarket: {
    homeOdds: { type: Number, default: 0 },
    awayOdds: { type: Number, default: 0 },
    status: { 
      type: String, 
      enum: ["active", "suspended", "settled"], 
      default: "active" 
    },
    
    winner: { 
      type: String, 
      enum: ["home", "away", null], 
      default: null 
    }
  },

  sessions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Session"
  }],
  providerId: { 
        type: String, 
        required: true // e.g., "35393146"
    },
  createdAt: Date,
  updatedAt: Date
});
module.exports = mongoose.model("Event", EventSchema);