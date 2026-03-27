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
    enum: ["upcoming", "pending", "live", "finished" , "settled"],
    default: "upcoming",
    required: true
  },

  result: {
    type: String,
    enum: ["home", "away", "draw", "void", null],
    default: null
  },

  // 1. Match Odds (Updated with explicit Back and Lay)
  matchOdds: {
    homeOdds: { type: Number, default: 0 }, // Back odds
    homeLay:  { type: Number, default: 0 }, // Lay odds
    awayOdds: { type: Number, default: 0 },
    awayLay:  { type: Number, default: 0 },
    drawOdds: { type: Number, default: 0 },
    drawLay:  { type: Number, default: 0 },
    status: { 
      type: String, 
      enum: ["active", "suspended"], 
      default: "active" 
    }
  },

  // 2. Toss Market (Updated with explicit Back and Lay)
  tossMarket: {
    homeOdds: { type: Number, default: 0 }, // Back
    homeLay:  { type: Number, default: 0 }, // Lay
    awayOdds: { type: Number, default: 0 }, // Back
    awayLay:  { type: Number, default: 0 }, // Lay
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
  }
}, {
  // Mongoose will automatically manage 'createdAt' and 'updatedAt' fields for you
  timestamps: true 
});

module.exports = mongoose.model("Event", EventSchema);