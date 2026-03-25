// services/oddsService.js
const axios = require('axios');

const API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = 'https://api.odds-api.io/v3';

// Cache to store odds and avoid redundant API calls
const oddsCache = new Map();
const CACHE_DURATION = 60000; // 60 seconds

const getUpcomingEvents = async function (sportKey = 'upcoming') {
  const apiKey = process.env.ODDS_API_KEY;
  // Note: The endpoint usually requires a sport key (e.g., 'soccer_uefa_champs_league' or 'upcoming')
  const url = `https://api.odds-api.io/v3/events?apiKey=${apiKey}&sport=cricket`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const errorDetail = await response.json();
      throw new Error(`API Error ${response.status}: ${errorDetail.message || response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch upcoming events:', error.message);
    throw error;
  }
}

const getSettledEvent = async function () {
    const API_KEY = process.env.ODDS_API_KEY;
    const BASE_URL = "https://api.odds-api.io/v3/events";

    // 1. Calculate the 'from' date (5 days ago)
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 3);
    const fromDate = fiveDaysAgo.toISOString(); // RFC3339 format
  console.log(fromDate);
    // 2. Build the query string
    const params = new URLSearchParams({
        apiKey: API_KEY,
        sport: 'cricket',
        status: 'settled', // 👈 Only fetch finished matches
        from: fromDate
    });

    const url = `${BASE_URL}?${params.toString()}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`API Error ${response.status}: ${error.message}`);
        }

        const data = await response.json();
        console.log(`Successfully fetched ${data.length} settled cricket matches.`);
        return data;

    } catch (error) {
        console.error('Failed to fetch settled events:', error.message);
        throw error;
    }
};

const getOddsforEvent = async function (ids) {
    const apiKey = process.env.ODDS_API_KEY;
    
    // Ensure ids is a comma-separated string even if an array is passed
    const eventIds = Array.isArray(ids) ? ids.join(',') : ids;
    const bookmakers = ['Unibet'].join(',');

    const url = `https://api.odds-api.io/v3/odds/multi?apiKey=${apiKey}&eventIds=${eventIds}&bookmakers=${bookmakers}`;

    try {
        const response = await fetch(url);
        
        // Check if the response is actually okay before parsing
        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`API Error ${response.status}: ${errBody}`);
        }

        const data = await response.json(); 
        
        // IMPORTANT: /multi returns an array. 
        // If you passed one ID, it will be [ {event1} ]
        // If you passed three IDs, it will be [ {event1}, {event2}, {event3} ]
        return data;

    } catch (error) {
        console.error('Odds Fetch Error:', error.message);
        throw error;
    }
};
module.exports = { getUpcomingEvents , getOddsforEvent , getSettledEvent };