const mongoose = require('mongoose');
// 1. Unwrapping the import
const passportLocalMongoose = require('passport-local-mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true,
        required: true
    },
    balance: {
        type: Number,
        default: 0,
        min: 0
    },
    role: {
        type: String,
        enum: ['user', 'admin', 'panel'],
        default: 'user'
    },
    contactNumber: {
        type: String,
        trim: true
    },
    isBlocked: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// 2. The Fix: Check if it's a function, if not, grab the 'default' function
const pluginFunction = (typeof passportLocalMongoose === 'function') 
    ? passportLocalMongoose 
    : passportLocalMongoose.default;

// 3. Apply the plugin
userSchema.plugin(pluginFunction);

module.exports = mongoose.model('User', userSchema);