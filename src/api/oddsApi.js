const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = 'https://api.odds-api.io/v3';

// Helper to get events
const fetchEvents = async (sportKey = 'upcoming') => {
    try {
        const response = await axios.get(`${BASE_URL}/events`, {
            params: {
                apiKey: API_KEY,
                sport: sportKey // Use 'upcoming' to see everything soon
            }
        });
        return response.data; 
    } catch (error) {
        console.error(`Error fetching ${sportKey}:`, error.response?.data || error.message);
        return []; // Return empty array on error to prevent crashing
    }
};

// FIX: Added 'eventId' as a parameter and included it in the request
const fetchOddsFromSource = async (eventId) => {
    const response = await axios.get(`${BASE_URL}/odds`, {
        params: {
            apiKey: API_KEY,
            eventId: eventId,      // 👈 Use the dynamic ID from the events list
            bookmakers: 'Bet365,Unibet', // 👈 Required for the odds endpoint
            markets: 'h2h'
        }
    });
    return response.data;
};

module.exports = { fetchOddsFromSource, fetchEvents };