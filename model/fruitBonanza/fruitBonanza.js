const mongoose = require("mongoose");

const FruitBonanzaBetSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    stake: { 
        type: Number, 
        required: true, 
        min: 10 // Keeping it consistent with your other games
    },
    
    // --- THE SLOT RESULT ---
    // We save the exact 3 symbols that landed on the winning line
    reel1: { type: String, required: true },
    reel2: { type: String, required: true },
    reel3: { type: String, required: true },
    
    status: {
        type: String,
        enum: ["won", "lost"],
        required: true
    },
    multiplier: {
        type: Number,
        default: 0
    },
    payout: { 
        type: Number, 
        default: 0 
    }
}, { 
    timestamps: true 
});

// Create an index to instantly load a user's slot history on their profile
FruitBonanzaBetSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("FruitBonanzaBet", FruitBonanzaBetSchema);