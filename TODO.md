# SkyRate AI V2 - Improvement TODOs

## My Schools Page Improvements

### 1. Display School Name from USAC
- **Current**: Shows "BEN 17012285" as the school name
- **Expected**: Show actual school name (e.g., "Lincoln Elementary School")
- **Solution**: Use `ben_enricher.py` logic to fetch `organization_name` from USAC API
- **API**: `https://opendata.usac.org/resource/srbr-2d59.json?ben={ben_number}`
- **Field**: `organization_name` from response

### 2. Fix Status Showing "Unknown"
- **Current**: Status shows "Unknown" badge
- **Expected**: Show "Active" or actual status from USAC
- **Solution**: Fetch entity status from USAC data
- **Possible statuses**: Active, Inactive, Pending, etc.

### 3. Enrich School Data with USAC Information
Using the `ben_enricher.py` script as reference, add the following data fields to the school detail page:

#### Entity Information
- [ ] Entity Name (`organization_name`)
- [ ] Entity Type (`organization_entity_type_name`)
- [ ] FRN Number
- [ ] DUB Number
- [ ] SAM ID

#### Location
- [ ] Full Address (Street, City, State, Zip)
- [ ] City
- [ ] State
- [ ] Zip Code

#### Student Data
- [ ] Students Over 3
- [ ] Students with Lunch (for discount calculation)
- [ ] CEP Score
- [ ] District Percentage

#### Funding Data
- [ ] Total Funding Committed
- [ ] Funding Years Active
- [ ] Category 1 vs Category 2 breakdown

### 4. School Detail Page Enhancement
Create a detailed school view with:
- [ ] Overview card with school name, address, entity type
- [ ] Funding history chart
- [ ] Application status timeline
- [ ] Contact information (if available)
- [ ] E-Rate discount rate display

### 5. Backend API Enhancements
- [ ] Create `/api/v1/schools/{ben}/enrich` endpoint
- [ ] Cache USAC data to avoid repeated API calls
- [ ] Add background job to periodically refresh school data

---

## Files to Reference
- `ben_enricher.py` - BEN enrichment script with USAC API calls
- `usac_data_fetcher.py` - Core data fetching utilities
- `get_ben_funding_balance.py` - Funding balance retrieval

## USAC API Endpoint
```
https://opendata.usac.org/resource/srbr-2d59.json?ben={BEN}&$limit=50&$order=funding_year DESC
```

---

## Additional TODOs (Add more below)

### 6. Save Generated Appeal Letters
- **Feature**: When generating an appeal letter using the section button, save it for the consultant
- **Requirements**:
  - [ ] Save appeal letter to database when generated
  - [ ] Associate appeal with school/BEN and consultant
  - [ ] Create "My Appeals" or "Appeal History" page for consultants
  - [ ] Allow consultants to view, edit, and re-download saved appeals
  - [ ] Add timestamp and version tracking for appeals
  - [ ] Option to mark appeals as "Submitted" or "Draft"

### 7. Interactive Appeal Chat / Refinement
- **Feature**: After generating an appeal letter, allow natural language conversation with the LLM to refine it
- **Requirements**:
  - [ ] Add chat interface below or beside the generated appeal letter
  - [ ] Allow user to ask questions about the appeal (e.g., "Why did you choose this argument?")
  - [ ] Allow user to request changes (e.g., "Make the tone more formal" or "Add more details about the contract")
  - [ ] Allow user to redirect the approach (e.g., "Focus more on the waiver request" or "Use a different legal argument")
  - [ ] Keep conversation history within the session
  - [ ] "Regenerate Appeal" button that incorporates chat feedback
  - [ ] Option to save the refined version as a new version
  - [ ] Show diff/comparison between original and refined versions
  - [ ] **Save chat conversation and all versions to database for future reference**
  - [ ] **Allow consultant to resume previous chat sessions**
  - [ ] **Include chat history when viewing saved appeals**

### 8. Auto-Import Schools via Consultant CRN (Consulting Firm Data)
- **Feature**: Automatically fetch and import all schools a consultant represents using their CRN from USAC Consulting Firm Data API
- **USAC Data Source**: Consulting Firm Data API (e.g., `{E-Rate 360 Solutions, LLC|16048893|ugarofano@erate360.com}` where `16048893` is the CRN)
- **Requirements**:
  
  #### Sign-Up Page
  - [ ] Add CRN (Consultant Registration Number) field to sign-up form for consultants
  - [ ] Validate CRN format
  - [ ] On signup, query USAC Consulting Firm Data API with CRN
  - [ ] Auto-import all schools linked to that CRN into consultant's "My Schools"
  - [ ] Show preview of schools found before finalizing signup
  
  #### Settings Page
  - [ ] Display current CRN in consultant profile settings
  - [ ] Allow consultant to request CRN change/update
  - [ ] CRN change requests go to pending approval queue
  - [ ] Show status of pending CRN change requests
  
  #### SuperAdmin Approval System
  - [ ] Create SuperAdmin dashboard/panel
  - [ ] List all pending CRN change requests
  - [ ] Show old CRN vs new CRN comparison
  - [ ] Approve or Reject CRN change with optional reason
  - [ ] Notify consultant of approval/rejection via email
  - [ ] On approval, re-sync schools from new CRN
  
  #### Backend API
  - [ ] Create `/api/v1/usac/consulting-firm/{crn}` endpoint
  - [ ] Create `/api/v1/consultant/crn-change-request` endpoint
  - [ ] Create `/api/v1/admin/crn-requests` endpoint (list, approve, reject)
  - [ ] Add `crn` field to consultant_profiles table
  - [ ] Add `crn_change_requests` table (id, consultant_id, old_crn, new_crn, status, created_at, reviewed_at, reviewed_by, reason)

### 9. Required Registration Numbers on Sign-Up (CRITICAL)
- **Feature**: Consultants and Vendors MUST provide their registration numbers during sign-up to auto-populate their school/client lists
- **Why**: This enables automatic discovery of all schools they work with via USAC API
- **Requirements**:

  #### Consultant Sign-Up
  - [ ] **REQUIRED**: CRN (Consultant Registration Number) field - cannot proceed without it
  - [ ] Validate CRN exists in USAC Consulting Firm Data
  - [ ] On signup, query USAC API to find all schools represented by this consultant
  - [ ] Auto-import all found schools into "My Schools" list
  - [ ] Show user how many schools were found before completing registration

  #### Vendor Sign-Up  
  - [ ] **REQUIRED**: SPIN (Service Provider Identification Number) field - cannot proceed without it
  - [ ] Validate SPIN exists in USAC Service Provider data
  - [ ] On signup, query USAC Form 471 API to find all schools/applicants vendor has contracts with
  - [ ] Find schools from Category 2 and Form 471 funded requests where vendor is listed
  - [ ] Auto-import all found schools into vendor's "My Clients" list
  - [ ] Show user how many schools/clients were found before completing registration

  #### USAC API Queries
  - [ ] Consultant: Query Form 471 data where `cnct_registration_num` = CRN
  - [ ] Vendor: Query Form 471 data where `service_provider_number` = SPIN
  - [ ] Extract unique BENs and organization names from results
  - [ ] Store relationship in database

  #### UI/UX
  - [ ] Show loading spinner while searching USAC
  - [ ] Display preview of schools found: "We found 47 schools you represent"
  - [ ] Allow user to confirm before importing
  - [ ] Handle case where no schools found (still allow signup but warn)

### 10. Natural Language Search Results - Add School to List
- **Feature**: Allow users to add schools from search results directly to their "My Schools" or "My Clients" list
- **Current Issue**: Search results show schools but no way to add them to your list
- **Requirements**:
  - [ ] Add "Add to My Schools" button/icon next to each row in search results table
  - [ ] For consultants: clicking adds school to their "My Schools" list
  - [ ] For vendors: clicking adds school to their "My Clients" list
  - [ ] Show confirmation toast/message when school is added
  - [ ] Disable button if school already in user's list
  - [ ] Allow bulk selection and "Add Selected" button
  - [ ] Show visual indicator for schools already in user's list

### 11. Search Results Table Pagination & Navigation
- **Feature**: Add proper pagination and display controls to search results table
- **Current Issue**: Table shows limited results with no way to see more or navigate
- **Requirements**:
  
  #### Pagination Controls
  - [ ] Add "Previous" and "Next" buttons for page navigation
  - [ ] Show page numbers (1, 2, 3... or 1 of 10)
  - [ ] "First" and "Last" page quick links
  - [ ] Display current page info: "Showing 1-50 of 2,847 results"

  #### Display Size Options
  - [ ] Dropdown to select rows per page: 10, 25, 50, 100
  - [ ] Remember user's preference in localStorage
  - [ ] Default to 25 or 50 rows

  #### Table Navigation
  - [ ] Horizontal scroll indicator if table is wider than viewport
  - [ ] Sticky header so column names visible when scrolling
  - [ ] Sticky first column (school name/BEN) for reference while scrolling right

  #### Sorting
  - [ ] Click column header to sort ascending/descending
  - [ ] Visual indicator for current sort column and direction
  - [ ] Allow multi-column sorting

  #### Search/Filter Within Results
  - [ ] Quick filter box to search within current results
  - [ ] Column-specific filters (dropdown for status, text input for names)

---

## Vendor Features & CRM Integration

### 12. CRM Export Integration for Vendors
- **Feature**: Generate Python code/API to export contact data directly to vendor's CRM system
- **Requirements**:
  - [ ] Create `/api/v1/vendor/export/crm` endpoint
  - [ ] Support common CRM formats: Salesforce, HubSpot, Zoho, CSV
  - [ ] Export fields: School name, BEN, contacts, email, phone, address, funding status
  - [ ] API documentation for CRM integration
  - [ ] Webhooks for real-time data sync
  - [ ] OAuth integration for direct CRM push
  - [ ] Bulk export with filters (by state, funding year, status)

### 13. Equipment Manufacturer Search (HIGH PRIORITY)
- **Feature**: Query for specific equipment manufacturers in E-Rate data (e.g., Cisco, Sonic Wall, Meraki, Aruba)
- **Current Gap**: "Query Bob" lacks this capability
- **Requirements**:
  - [ ] Add manufacturer field to natural language query interpretation
  - [ ] Search Form 471 Line Items for equipment manufacturer names
  - [ ] Filter by manufacturer: Cisco, Juniper, Aruba, Meraki, Fortinet, Sonic Wall, etc.
  - [ ] Show schools using specific equipment brands
  - [ ] Historical data: Which schools switched manufacturers year-over-year
  - [ ] Market share analysis by state/region

### 14. Enhanced Contact Data Enrichment
- **Feature**: Provide comprehensive, updated contact information for schools
- **Requirements**:
  - [ ] Multiple Points of Contact (POCs) per school, not just one
  - [ ] Include Executive Directors, CFOs, Technology Directors
  - [ ] Fetch from multiple USAC data sources
  - [ ] Contact role identification (Decision Maker, Technical, Billing)
  - [ ] Email validation/verification status
  - [ ] Last updated timestamp for each contact
  - [ ] Cross-reference with Form 470 and Form 471 contact data
  - [ ] LinkedIn integration for contact enrichment (future)

### 15. Competitive Analysis - Form 471 Vendor Details
- **Feature**: Show chosen vendors and bid details for competitive intelligence
- **Requirements**:
  - [ ] Display Form 471 service provider information by BEN
  - [ ] Show winning vendor for each funding request
  - [ ] Contract amounts and terms
  - [ ] Year-over-year vendor comparison for each school
  - [ ] "Lost deals" analysis - who won when you didn't
  - [ ] Bid history and competitive landscape
  - [ ] Alert when a school's contract is expiring (Form 470 window)

### 16. Vendor Contract Tracker (Post-Sales) - BY SPIN
- **Feature**: Vendors can view their own contracts year-to-year using their SPIN number
- **Requirements**:
  - [ ] Dashboard showing all contracts by SPIN
  - [ ] Year-over-year revenue tracking
  - [ ] Contract renewal dates and alerts
  - [ ] Schools served breakdown by year
  - [ ] Category 1 vs Category 2 split
  - [ ] Revenue trends and forecasting
  - [ ] Export contract history to Excel/PDF
  - [ ] Compare performance across funding years

### 17. FRN Status Monitor (Post-Sales)
- **Feature**: Monitor and display FRN funding status, denials, and disbursements
- **Requirements**:
  - [ ] Real-time FRN status tracking
  - [ ] Funding committed vs disbursed amounts
  - [ ] Denial tracking with reasons
  - [ ] USAC inquiry/question monitoring
  - [ ] Alert notifications for status changes
  - [ ] SPIN-based filtering for vendors
  - [ ] Timeline view of FRN lifecycle
  - [ ] BEAR/SPI reimbursement status
  - [ ] Invoice tracking integration
  - [ ] Disbursement forecasting


