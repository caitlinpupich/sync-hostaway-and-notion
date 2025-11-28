const axios = require('axios');
const { URLSearchParams } = require('url'); 

// Pull from environment
const HOSTAWAY_ACCOUNT_ID = process.env.HOSTAWAY_ACCOUNT_ID;
const HOSTAWAY_API_SECRET = process.env.HOSTAWAY_API_SECRET; 
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

const HOSTAWAY_BASE_URL = "https://api.hostaway.com/v1";
// The number of months to look ahead for reporting (e.g., current month + 5 future months)
const MONTHS_TO_REPORT = 6; 

// --- DATE HELPERS ---

// Helper function to format a Date object into a YYYY-MM-DD string for URL parameters.
function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Returns the first day of the current month in YYYY-MM-DD format.
function getStartDate(today) {
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const formattedDate = formatDate(startDate);
    console.log('Data Start Point: ', formattedDate);
    return formattedDate;
}

// Returns the last day of the month 6 months in the future in YYYY-MM-DD format.
function getEndDate(today) {
    // getMonth() + MONTHS_TO_REPORT + 1 gives the month *after* the reporting period. Day 0 gives the last day of the desired month.
    const endDate = new Date(today.getFullYear(), today.getMonth() + MONTHS_TO_REPORT + 1, 0); 
    const formattedDate = formatDate(endDate);
    console.log('Data End Date: ', formattedDate);
    return formattedDate;
}

// --- HOSTAWAY API FUNCTIONS ---

async function getAccessToken() {
    // Your token function is already perfect, defining body/config and handling errors.
    const url = `${HOSTAWAY_BASE_URL}/accessTokens`;
    const data = {
        grant_type: "client_credentials",
        client_id: HOSTAWAY_ACCOUNT_ID,
        client_secret: HOSTAWAY_API_SECRET,
        scope: "general"
    };

    const params = new URLSearchParams(data);
    const body = params.toString(); 

    const config = { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } };

    console.log("Attempting to get Access Token...");

    try {
        const response = await axios.post(url, body, config);
        const accessToken = response.data.access_token;
        console.log("Token received successfully.");
        return accessToken;
    } catch (error) {
        if (error.response) {
            console.error("API Request Failed with Status:", error.response.status);
            throw new Error(`Hostaway API Auth Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
        } else {
            console.error("Authentication Error:", error.message);
            throw new Error(`Authentication Failed: ${error.message}`);
        }
    }
}

async function fetchHostawayReservations(url, token) {
    console.log("Fetching reservations from Hostaway...");
    
    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });
        
        const reservations = response.data.result || []; 
        console.log(`Successfully fetched ${reservations.length} reservations.`);
        return reservations;
        
    } catch (error) {
        console.error("Error fetching Hostaway reservations:", error.message);
        throw new Error("Failed to fetch reservation data from Hostaway.");
    }
}

// --- RESERVATION PROCESSING ---

// filter array of returned reservations to only include active reservations (status = new OR modified)
function filterActiveReservations (reservationList) {
    console.log(`Filtering ${reservationList.length} reservations...`);

    const activeReservations = reservationList.filter(reservation => {
        const status = reservation.status;
        return status === "new" || status === "modified";
    });
    console.log(`Found ${activeReservations.length} active reservations.`);
    return activeReservations; // MUST RETURN THE FILTERED ARRAY
}


// Function to calculate the total number of reserved nights for a listing within each month.
function calculateMonthlyOccupancy(listing, activeReservations, monthDetails) {
    const monthlyOccupancy = {};
    const listingReservations = activeReservations.filter(r => 
        String(r.listingMapId) === String(listing.id)
    );

    //Return 0 for listings that have no reservations for the specified month
    if (listingReservations.length === 0) {
        monthDetails.forEach(month => { monthlyOccupancy[month.name] = 0; });
        return monthlyOccupancy;
    }
    
    monthDetails.forEach(month => {
        const monthStart = month.startDate;
        
        // Get the last day of the current reporting month (Day 0 of the next month) + # of days in specified month.
        const nextMonthIndex = monthStart.getMonth() + 1;
        const monthEnd = new Date(monthStart.getFullYear(), nextMonthIndex, 0);
        const daysInMonth = monthEnd.getDate(); 
        let bookedNights = 0;

        listingReservations.forEach(reservation => {
            //Access dates from reservation object and convert to Date objects
            const checkInDate = new Date(reservation.arrivalDate);
            const checkOutDate = new Date(reservation.departureDate); // Use departureDate
            
            // If the departure is before the month starts or arrival is after the month ends, skip.
            if (checkOutDate <= monthStart || checkInDate > monthEnd) {
                return; 
            }

            // If the stay starts BEFORE the month start, count the stay start ase the first of the month. Otherwise, use the checkin date.
            const stayStart = (checkInDate < monthStart) ? monthStart : checkInDate;

            // If the checkout happens after the end of the month, count the end of the month as checkout. Otherwise, use the res checkout date.
            // The last moment of the month is the end of the last booked night.
            const monthEndNextDay = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate() + 1); 
            const stayEnd = (checkOutDate > monthEndNextDay) ? monthEndNextDay : checkOutDate;
            
            //Calculate the nights booked that fall within the month (using the effective checkin and checkout dates calculated above.)
            if (stayStart < stayEnd) {
                // Time difference in milliseconds (best accuracy for JS)
                const timeDifference = stayEnd.getTime() - stayStart.getTime();
                // Convert to days (3,600,000 seconds in an hour, 24 hours in a day)
                const nightsInMonth = timeDifference / (1000 * 3600 * 24); 
                bookedNights += nightsInMonth;
            }
        });
        
        const occupancyRate = (bookedNights / daysInMonth) || 0;
        
        // Round to 4 decimal places (for percentage display in Notion)
        monthlyOccupancy[month.name] = parseFloat(occupancyRate.toFixed(4));
    });

    return monthlyOccupancy;
}


//Main function to pull the reservations and calculate the occupancy
async function pullReservationsCalculateOccupancy () {
    const today = new Date(); 
    const startDate = getStartDate(today);
    const endDate = getEndDate(today);

    //ONE: Pull property ids from env
    const HOSTAWAY_LISTING_IDS_STRING = process.env.HOSTAWAY_LISTING_IDS
    if (!HOSTAWAY_LISTING_IDS_STRING) {
        console.error("HOSTAWAY_LISTING_IDS environment variable is missing. Cannot proceed");
        return;
    }
    const listingIds = HOSTAWAY_LISTING_IDS_STRING.split(',').map(id => id.trim()).filter(id => id.length > 0);
    console.log(`Found ${listingIds.length} listings in .env to process.`);

    const listings = listingIds.map(id => ({ id: id }));

    // 1. Get Authentication Token
    let token;
    try {
        token = await getAccessToken();
    } catch (e) {
        console.error("Authentication failed. Stopping script.", e.message);
        return;
    }
    
    // TWO: Build the API URL
    const url = `${HOSTAWAY_BASE_URL}/reservations/?limit=300&arrivalStartDate=${startDate}&arrivalEndDate=${endDate}`;
    console.log('API Call URL:', url);

    // THREE: Fetch Reservation data
    let fullReservationList = [];
    try {
        //Pass the acquired token to the fetch function
        fullReservationList = await fetchHostawayReservations(url, token);
    } catch (e) {
        console.error("Skipping occupancy calculation due to failed reservation fetch.");
        return; 
    }
    
    // FOUR: Filter active reservations
    const activeReservations = filterActiveReservations(fullReservationList);

    // FIVE: Prepare the array that will define the reporting months
    const monthDetails = []
    for (let i =0; i < MONTHS_TO_REPORT; i++) {
        const monthStart = new Date(today.getFullYear(), today.getMonth() + i, 1)
        const monthName = monthStart.toLocaleString('en-US', { month: 'short', year: 'numeric' })
        monthDetails.push({
            name: `Occupancy: ${monthName}`, // Changed 'Occupanyc' to 'Occupancy'
            startDate: monthStart
        })
    }

    // 6. Calculate the occupancy for each listing
    const results = listings.map(listing => {
        const monthlyRates = calculateMonthlyOccupancy(listing, activeReservations, monthDetails)
        return {
            listingId: listing.id, // Use a clear property name
            occupancy: monthlyRates
        }
    })
    console.log("\n--- Final Occupancy Results ---");
    console.log(JSON.stringify(results, null, 2));
}



module.exports = { 
    pullReservationsCalculateOccupancy 
};