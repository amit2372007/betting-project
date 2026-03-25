const mongoose = require('mongoose');

const aviatorRoundSchema = new mongoose.Schema({
    roundId: {
        type: String,
        required: true,
        unique: true,
        index: true // Indexed for super fast lookups when settling bets
    },
    status: {
        type: String,
        enum: ['starting', 'flying', 'crashed'],
        default: 'starting'
    },
    crashPoint: {
        type: Number,
        // The crash point is only required once the plane actually crashes
        required: function() { return this.status === 'crashed'; }
    },
    
    // --- Provably Fair System (Industry Standard for Crash Games) ---
    // This allows users to verify the crash point wasn't manipulated mid-flight
    hash: { type: String },
    serverSeed: { type: String },
    clientSeed: { type: String },
    
    // --- Admin Analytics ---
    totalPlayers: { type: Number, default: 0 },
    totalWagered: { type: Number, default: 0 },
    totalPayout: { type: Number, default: 0 },

    startTime: { type: Date },
    endTime: { 
        type: Date, 
        // 🔥 Automated Cleanup: MongoDB will silently delete this document 7 days (604800 seconds) after it finishes!
        expires: 604800 
    }
}, { timestamps: true });

module.exports = mongoose.model('AviatorRound', aviatorRoundSchema);