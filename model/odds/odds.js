const mongoose = require("mongoose");

const OddsSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event"
  },

  market: {
    type: String,
    enum: ["h2h"],
    default: "h2h"
  },

  odds: {
    home: Number,
    draw: Number,
    away: Number
  },

  source: {
    type: String,
    enum: ["api", "generated"],
    default: "api"
  },

  isLive: Boolean,

  updatedAt: {
    type: Date,
    default: Date.now
  }
});
module.exports = mongoose.model("Odds", OddsSchema);