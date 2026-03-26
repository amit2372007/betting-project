const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // We use process.env to hide your real database URL for security!
        const conn = await mongoose.connect(process.env.DB_URL, {
            // These settings prevent the app from crashing if your Wi-Fi drops
            serverSelectionTimeoutMS: 5000, 
            socketTimeoutMS: 45000, 
            family: 4 // Use IPv4, skip trying IPv6
        });

        console.log(`✅ MongoDB Connected`);
    } catch (err) {
        console.error(`❌ MongoDB Connection Error: ${err.message}`);
        // Exit process with failure if the initial connection completely fails
        process.exit(1); 
    }
};

// --- CRITICAL EVENT LISTENERS ---
// These catch errors that happen AFTER the initial connection
mongoose.connection.on('error', (err) => {
    console.error('MongoDB runtime error:', err.message);
});

mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected! Mongoose will try to auto-reconnect...');
});

module.exports = connectDB;