

#Hostaway and Notion Sync

The purpose of this code is to pull occupancy data from Hostaway (using specified user information hidden in the .env). That data will then be converted to show the percentage occupancy per listing, per month. This final formatted data will be exported to notion.

* **Feature 1:** Pull all reservation data in the specified time from Hostaway.
* **Feature 2:** Filter reservation data to only include active reservations (so cancelled reservations, inquiries, etc. will not be included)
* **Feature 3:** Determine the first and last day each month in the reporting period, then determine which days of each reservation fall within that month.
* **Feature 4:** Convert the final data into a percentage of nights booked per month, per listing.
* **Feature 5:** Export the data into a Notion chart. 


##Mermaid Diagram
graph TD
    A[Start: pullReservationsCalculateOccupancy] --> B{Get Current Dates (Start/End)};
    B --> C[Read Listing IDs from ENV];
    C --> D{Get Access Token (getAccessToken)};
    D -- Success --> E[Build Hostaway API URL];
    D -- Failure --> F(Error: Auth Failed. Stop);
    E --> G{Fetch Reservations (fetchHostawayReservations)};
    G -- Success --> H[Filter Active Reservations (filterActiveReservations)];
    G -- Failure --> I(Error: Fetch Failed. Stop);
    H --> J[Prepare Month Details Array];
    J --> K[Calculate Occupancy for Each Listing];
    K --> L[calculateMonthlyOccupancy];
    K --> M[Aggregate Results];
    M --> N(End: Log Final Occupancy Results);

    %% Subprocess Details for Functions
    subgraph Date Helpers
        B --> B1[getStartDate];
        B --> B2[getEndDate];
        B1 --> Z1[formatDate];
        B2 --> Z1;
    end
    
    subgraph Hostaway API
        D --> D1[API Call: /accessTokens];
        D1 --> D2{Handle Auth Response};
        G --> G1[API Call: /reservations];
        G1 --> G2{Handle Reservation Response};
    end
    
    subgraph Reservation Processing
        H --> H1{Filter by status = 'new' OR 'modified'};
        K --> L;
        L --> L1[Iterate Listings & Months];
        L1 --> L2[Filter Reservations for Listing];
        L2 --> L3[Calculate Booked Nights per Month];
        L3 --> L4[Calculate Occupancy Rate];
        L4 --> L5[Return monthlyOccupancy Object];
    end

    style F fill:#f99,stroke:#333,stroke-width:2px
    style I fill:#f99,stroke:#333,stroke-width:2px


    ##Installation

To get a local copy up and running, follow these simple steps.

1.  Clone the repo:
    ```bash
    git clone [https://github.com/yourusername/projectname.git](https://github.com/yourusername/projectname.git)
    ```
2.  Install NPM packages:
    ```bash
    npm install
    ```
3. Add your Hostaway and Notion Keys and Credentials to a .env file and ensure the code pulls the data correctly. Format for .env: 
HOSTAWAY CONFIGURATION
HOSTAWAY_ACCOUNT_ID=111111
HOSTAWAY_API_SECRET=11111111111111111111111

HOSTAWAY_LISTING_IDS = "111111, 222222, 333333, 444444, 555555"


NOTION CONFIGURATION
NOTION_API_KEY="ntn_111111111111111111111"
NOTION_DATABASE_ID="111111111111111111"

## 💻 Usage

Run the main application file:

```bash
node index.js