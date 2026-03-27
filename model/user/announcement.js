const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
    message: {
        type: String,
        required: true,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
        // If true, it shows on the site. If false, it's hidden.
    },
    theme: {
        type: String,
        enum: ['primary', 'success', 'danger', 'info'],
        default: 'primary'
        // Allows admins to color-code the message (e.g., orange for IPL, green for winners, red for maintenance)
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // Optional: tracks which admin posted it
    }
}, { timestamps: true });

// Only one announcement should ideally be active at a time, 
// so you can query for the latest active one easily.
const Announcement = mongoose.model('Announcement', announcementSchema);

module.exports = Announcement;