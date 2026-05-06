const mongoose = require("mongoose");

const influencerSchema = new mongoose.Schema(
  {
    // --- Basic Influencer Info ---
    name: {
      type: String,
      required: true,
      trim: true,
    },
    contactNumber: {
      type: String,
      trim: true,
    },
    promoCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    // --- Commission Structure ---
    commissionRate: {
      type: Number,
      required: true,
      default: 5,
      min: 0,
      max: 100,
    },

    // --- Tracking & Metrics ---
    totalClicks: {
      type: Number,
      default: 0,
    },
    totalRegistrations: {
      type: Number,
      default: 0,
    },
    // ADDED THIS BACK SO YOUR CTR SAVES CORRECTLY!
    clickRate: {
      type: Number,
      default: 0,
    },

    // --- Financial Records ---
    totalEarnings: {
      type: Number,
      default: 0,
    },
    pendingPayout: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// --- Middleware: Auto-calculate clickRate (CTR) before saving ---
influencerSchema.pre("save", function (next) {
  if (this.totalClicks > 0) {
    this.clickRate = Number(
      ((this.totalRegistrations / this.totalClicks) * 100).toFixed(2),
    );
  } else {
    this.clickRate = 0;
  }
  next();
});

// CRITICAL FIX: The 3rd argument forces Mongoose to use your exact collection name.
// IMPORTANT: Change "influencers" to EXACTLY what it is named in your MongoDB Compass (e.g., "influencer" or "Influencer")
const Influencer = mongoose.model(
  "Influencer",
  influencerSchema,
  "influencers",
);

module.exports = Influencer;
