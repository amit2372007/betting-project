const mongoose = require("mongoose");

const SevenUpBetSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    stake: { 
        type: Number, 
        required: true, 
        min: 10 
    },
    enum: [
            "7_down", "7_exact", "7_up", 
            "sum_2", "sum_3", "sum_4", "sum_5", "sum_6", "sum_7", 
            "sum_8", "sum_9", "sum_10", "sum_11", "sum_12"
        ],
    // We save the exact dice rolled for Provably Fair auditing
    dice1: { type: Number, required: true, min: 1, max: 6 },
    dice2: { type: Number, required: true, min: 1, max: 6 },
    sum: { type: Number, required: true },
    
    status: {
        type: String,
        enum: ["won", "lost"],
        required: true
    },
    payout: { 
        type: Number, 
        default: 0 
    }
}, { 
    timestamps: true 
});

// Index for instantly loading a user's bet history on their profile
SevenUpBetSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("SevenUpBet", SevenUpBetSchema);