/**
 * Hostaway to Notion Synchronization Script (Node.js/Google Cloud Function)
 * * This file serves as the local execution environment for the logic
 * contained in reservation-pull.js.
 */
// Load environment variables from .env file
require('dotenv').config();

// Load the logic file which contains the main function
const { pullReservationsCalculateOccupancy } = require('./reservation-pull.js');

// Execute the main process
console.log("Starting Hostaway Reservation Sync Script...");
pullReservationsCalculateOccupancy()
    .then(() => {
        console.log("Script finished successfully.");
    })
    .catch(error => {
        console.error("Script failed with a critical error:", error.message);
    });
