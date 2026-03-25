const mongoose = require('mongoose');

const DepositAccountSchema = new mongoose.Schema({
    // 1. Core Details
    methodType: {
        type: String,
        enum: ['upi', 'bank_transfer', 'qr_scanner'],
        required: true
    },
    isActive: {
        type: Boolean,
        default: true,
        // Admins can toggle this off when an account reaches its limit
    },
    displayName: {
        type: String,
        required: true,
        // e.g., "Main UPI", "HDFC Bank VIP", "Scanner 1"
    },

    // 2. Target Assignment (Optional)
    assignedToUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        // If null, ALL users see this payment method.
        // If an ObjectId is set, ONLY that specific user sees this account.
    },

    // 3. Bank Transfer Details (Used if methodType === 'bank_transfer')
    bankDetails: {
        accountName: { type: String },
        accountNumber: { type: String },
        ifscCode: { type: String },
        bankName: { type: String }
    },

    // 4. UPI Details (Used if methodType === 'upi' or 'qr_scanner')
    upiDetails: {
        upiId: { type: String },
        merchantName: { type: String }
    },

    // 5. QR Code Image (Used if methodType === 'qr_scanner')
    qrCodeUrl: {
        type: String,
        // URL to the image uploaded by the admin (e.g., Cloudinary or local path)
    },

    // 6. Deposit Limits
    minDeposit: {
        type: Number,
        default: 100
    },
    maxDeposit: {
        type: Number,
        default: 50000
    }
}, {
    timestamps: true
});

// Indexing for faster queries when filtering active accounts for a user
DepositAccountSchema.index({ isActive: 1, assignedToUser: 1, methodType: 1 });

module.exports = mongoose.model('DepositAccount', DepositAccountSchema);