const axios = require('axios');
const { response } = require('express');

const API_KEY = process.env.API_KEY2;
const BASE_URL = 'https://api.the-odds-api.com';

const getUpcomingEvents = async function (sportKey = 'upcoming') {
  
  const sport = 'cricket'; // Example sport key
  const regions = 'intl,au';   // 'intl' is great for Indian/Asian markets
  const markets = 'h2h';
  // Note: The endpoint usually requires a sport key (e.g., 'soccer_uefa_champs_league' or 'upcoming')
  const sportsKey = `${BASE_URL}/v4/sports/${sport}/odds?regions=us&oddsFormat=decimal&apiKey=${API_KEY}`
  const url = `${BASE_URL}/v4/sports/${sport}/?apiKey=${API_KEY}&regions=${regions}&markets=${markets}`;

  try {
    const response = await fetch(sportsKey);

    const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const text = await response.text();
            console.error("The API sent back HTML instead of JSON. Check your URL structure.");
            console.error("Raw response snippet:", text.substring(0, 100));
            throw new Error("Received HTML instead of JSON. Possible 404 error.");
        }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch upcoming events:', error.message);
    throw error;
  }

}

async function getCricketSportKeys() {
  const res = await fetch(`${BASE_URL}/v4/sports?apiKey=${API_KEY}`);
  const sports = await res.json();

  return sports
    .filter(s => s.key.startsWith("cricket") && s.active)
    .map(s => s.key);
}


module.exports = {getUpcomingEvents , getCricketSportKeys};