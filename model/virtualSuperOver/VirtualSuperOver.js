const mongoose = require("mongoose");

// Sub-schema for individual deliveries (Ball-by-Ball)
const ballSchema = new mongoose.Schema({
    ballNumber: { type: Number, required: true }, // e.g., 1, 2, 3, 4, 5, 6
    outcome: { 
        type: String, 
        enum: ['0', '1', '2', '3', '4', '6', 'W', 'wd', 'nb'], 
        required: true 
    },
    runsAdded: { type: Number, required: true }, // Numeric value (e.g., '6' = 6, 'W' = 0, 'wd' = 1)
    isLegal: { type: Boolean, default: true } // False for wides/no-balls
}, { _id: false }); // Disable _id for subdocuments to save space

// Sub-schema for an entire Innings
const inningsSchema = new mongoose.Schema({
    battingTeam: { type: String }, // "home" or "away"
    bowlingTeam: { type: String }, // "home" or "away"
    totalRuns: { type: Number, default: 0 },
    totalWickets: { type: Number, default: 0 },
    legalBallsBowled: { type: Number, default: 0 }, // Max 6
    timeline: [ballSchema] // Array of all deliveries in order
}, { _id: false });

// Main Event Schema
const VirtualSuperOverSchema = new mongoose.Schema({
    eventId: { 
        type: String, 
        required: true, 
        unique: true,
        index: true // Indexed for lighting-fast queries
    },
    homeTeam: { type: String, required: true }, // e.g., "India"
    awayTeam: { type: String, required: true }, // e.g., "Pakistan"
    
    // Tracks the exact phase of the game loop
    status: { 
        type: String, 
        enum: ['scheduled', 'toss', 'innings_1', 'break', 'innings_2', 'completed', 'abandoned'],
        default: 'scheduled'
    },

    toss: {
        winner: { type: String, enum: ['home', 'away', null], default: null },
        decision: { type: String, enum: ['bat', 'bowl', null], default: null }
    },

    innings1: { type: inningsSchema, default: () => ({}) },
    innings2: { type: inningsSchema, default: () => ({}) },

    result: {
        winner: { type: String, enum: ['home', 'away', 'tie', null], default: null },
        margin: { type: String, default: null } // e.g., "Home won by 12 runs"
    },

    startedAt: { type: Date },
    completedAt: { type: Date }

}, { 
    timestamps: true 
});

// Indexes for fetching recent completed matches or active matches
VirtualSuperOverSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("VirtualSuperOver", VirtualSuperOverSchema);