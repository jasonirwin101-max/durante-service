# Durante Equipment Service — CLAUDE.md
## Project Intelligence & Build Guide
> Version 2.0 | Standalone App | Built with Claude Code

---

## What We Are Building

A fully standalone web application for Durante Equipment that manages service requests
from submission through completion. No external workflow tools. The app owns everything:
entry form, data storage, notifications, tech field interface, office dashboard, and
customer tracking page.

---

## System Architecture

```
[/submit]        → Service request entry form (DE employee submits)
      │
      ▼
[Express Backend /server]
      ├── Google Sheets API       → All data storage (3 sheets)
      ├── Microsoft Graph API     → Email notifications via Outlook
      └── RingCentral API         → SMS notifications
      │
[React Frontend /client]
      ├── /submit   → Entry form (DE employee, any device)
      ├── /tech     → Tech mobile interface (field use)
      ├── /office   → Office dashboard (Eddie, Nestor, management)
      └── /track    → Public customer tracking page (no login required)
```

---

## Folder Structure

```
durante-service/
├── CLAUDE.md                          ← This file — read first every session
├── .env                               ← All secrets (NEVER commit to git)
├── .env.example                       ← Variable names only, no values
├── .gitignore                         ← Must include .env and service account JSON
├── package.json                       ← Root workspace config
├── netlify.toml                       ← Netlify deployment config
│
├── /server
│   ├── index.js                       ← Express entry point (port 3001)
│   ├── /routes
│   │   ├── submit.js                  ← POST /api/submit — new service request
│   │   ├── serviceRequests.js         ← GET/PATCH service request CRUD
│   │   ├── techs.js                   ← Tech user management
│   │   ├── track.js                   ← GET /api/track/:id — public endpoint
│   │   └── notifications.js           ← POST /api/notify — manual re-send
│   ├── /services
│   │   ├── sheets.js                  ← Google Sheets read/write
│   │   ├── ringcentral.js             ← SMS via RingCentral
│   │   ├── outlook.js                 ← Email via Microsoft Graph
│   │   ├── notifications.js           ← Template engine + dispatch logic
│   │   └── pdf.js                     ← Completion report PDF (pdfkit)
│   ├── /middleware
│   │   └── auth.js                    ← JWT verification middleware
│   └── /utils
│       ├── idGenerator.js             ← Generates SR IDs
│       ├── statusFlow.js              ← Valid status transitions
│       └── emailDeriver.js            ← Builds @duranteequip.com email from name
│
└── /client
    ├── /submit                        ← React app — entry form
    ├── /tech                          ← React app — mobile field interface
    ├── /office                        ← React app — desktop dashboard
    └── /track                         ← React app — public tracking page
```

Each React app uses: Vite + React 18 + Tailwind CSS + React Router v6 + Axios

---

## Environment Variables

File: `.env` in project root — never commit this file.

```bash
# ─── GOOGLE SHEETS ───────────────────────────────────────────
GOOGLE_SPREADSHEET_ID=1zzEem4pzLERoA--qFotF5e0o02Xe2alKpLz-AWUQ1qw
GOOGLE_SERVICE_ACCOUNT_EMAIL=durante-service-app@durante-equipment-service.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n[from JSON file]\n-----END PRIVATE KEY-----\n"

# ─── RINGCENTRAL SMS ─────────────────────────────────────────
RINGCENTRAL_SERVER_URL=https://platform.ringcentral.com
RINGCENTRAL_CLIENT_ID=W4vtdmigkReeEhY8NngShk
RINGCENTRAL_CLIENT_SECRET=[your client secret]
RINGCENTRAL_JWT_TOKEN=[your JWT token]
RINGCENTRAL_FROM_NUMBER=[Durante RingCentral number e.g. +19545550000]

# ─── MICROSOFT GRAPH / OUTLOOK ───────────────────────────────
AZURE_TENANT_ID=df34f6ba-91ac-4f8c-b3a5-a77fb6fcab63
AZURE_CLIENT_ID=4ad4c177-899c-4d7f-a4a0-642c8a272833
AZURE_CLIENT_SECRET=[your Azure client secret value]
OUTLOOK_FROM_EMAIL=jirwin@duranteequip.com

# ─── APP CONFIG ──────────────────────────────────────────────
PORT=3001
BASE_URL=https://service.duranteequip.com
JWT_SECRET=[generate a long random string — 64+ chars]
JWT_EXPIRES_IN=8h
NODE_ENV=production

# ─── DURANTE BUSINESS INFO ───────────────────────────────────
DURANTE_OFFICE_PHONE=954-XXX-XXXX
DURANTE_OFFICE_EMAIL=service@duranteequip.com
```

---

## Google Sheets Data Model

Spreadsheet ID: `1zzEem4pzLERoA--qFotF5e0o02Xe2alKpLz-AWUQ1qw`
Shared with: `durante-service-app@durante-equipment-service.iam.gserviceaccount.com`

### Sheet 1: `ServiceRequests`

Row 1 is the header row. Data starts at Row 2.
NEVER insert columns — only append to the right.

| Col | Header | Description |
|-----|--------|-------------|
| A | SR_ID | Auto-generated e.g. SR-2026-0001 |
| B | Submitted_On | ISO timestamp of form submission |
| C | Company_Name | Customer company name |
| D | Contact_Name | Person to notify at the customer |
| E | Contact_Phone | Customer phone — SMS target |
| F | Contact_Email | Customer email — email target |
| G | Site_Address | Job site address |
| H | Customers_Need | What the customer needs |
| I | Asset_Number | Equipment asset number from form |
| J | Unit_Number | Tech fills in from field |
| K | Equipment_Description | Description of the equipment |
| L | Problem_Description | Description of the issue |
| M | Submitter_Name | DE employee who submitted |
| N | Submitter_Phone | DE employee mobile — SMS notifications |
| O | Photo_1 | Google Drive URL of uploaded photo |
| P | Photo_2 | Google Drive URL of uploaded photo |
| Q | Photo_3 | Google Drive URL of uploaded photo |
| R | Photo_4 | Google Drive URL of uploaded photo |
| S | Assigned_Tech | Tech assigned by office |
| T | Current_Status | Machine-readable status |
| U | Status_Updated_At | ISO timestamp of last status change |
| V | Status_Updated_By | Name of tech or office staff |
| W | ETA | Free text e.g. "Between 2–4 PM" |
| X | Scheduled_Date | Scheduled service date/time |
| Y | Tech_Notes | Field notes added by tech |
| Z | Completion_Photo_URL | Google Drive URL of completion photo |
| AA | Tracking_URL | BASE_URL/track/SR_ID |
| AB | Satisfaction_Rating | 1–5 from customer after completion |
| AC | Escalation_Flag | TRUE if overdue alert has fired |
| AD | PDF_Report_URL | Google Drive URL of completion PDF |
| AE | Internal_Notes | Office notes — never shown to customer |
| AF | Operator_Issue | TRUE if issue was operator error |
| AG | Customer_Charged | TRUE if customer was charged |
| AH | Amount_Charged | Dollar amount charged |
| AI | Service_Completed | TRUE when status = COMPLETE |

### Sheet 2: `StatusHistory`

Append-only. Never modify existing rows.

| Col | Header | Description |
|-----|--------|-------------|
| A | SR_ID | Links to ServiceRequests |
| B | Status | Status at this point in time |
| C | Notes | Tech or office notes |
| D | Updated_By | Full name |
| E | Role | "Tech" or "Office" |
| F | Timestamp | ISO timestamp |
| G | Customer_Notified | TRUE/FALSE |
| H | Submitter_Notified | TRUE/FALSE |
| I | SMS_Sent | TRUE/FALSE |
| J | Email_Sent | TRUE/FALSE |

### Sheet 3: `Techs`

| Col | Header | Description |
|-----|--------|-------------|
| A | Tech_ID | e.g. TECH-001 |
| B | Full_Name | Full name |
| C | Email | @duranteequip.com email |
| D | Phone | Mobile number for SMS |
| E | PIN | bcrypt hashed 4-digit PIN |
| F | Role | "Tech" or "Office" |
| G | Active | TRUE/FALSE |
| H | Created_At | ISO timestamp |

Seed data already in sheet:
- TECH-001 | Eddie Rivera | erivera@duranteequip.com | Tech | TRUE
- TECH-002 | Nestor Balmaseda | nbalmaseda@duranteequip.com | Tech | TRUE

---

## SR ID Generation

Format: `SR-YYYY-NNNN` (zero-padded sequential per year)
Example: `SR-2026-0042`

Logic in `/server/utils/idGenerator.js`:
1. Read all rows from ServiceRequests
2. Find highest existing SR number for current year
3. Increment by 1, zero-pad to 4 digits
4. Start at 0001 if no SRs exist for current year

---

## Submitter Email Derivation

```javascript
// /server/utils/emailDeriver.js
// Format: first initial + last name
// "Jason Irwin" → "jirwin@duranteequip.com"
// "Eddie Rivera" → "erivera@duranteequip.com"
function deriveSubmitterEmail(fullName) {
  const parts = fullName.trim().toLowerCase().split(/\s+/)
  if (parts.length < 2) return null
  return `${parts[0][0]}${parts[parts.length - 1]}@duranteequip.com`
}
```

---

## Status Reference

```javascript
const STATUSES = {
  RECEIVED:            'Received',           // Auto on form submit
  ACKNOWLEDGED:        'Acknowledged',       // Office confirms receipt
  SCHEDULED:           'Scheduled',          // Office sets date/time
  DISPATCHED:          'Dispatched',         // Tech or office
  ON_SITE:             'On Site',            // Tech arrival tap
  DIAGNOSING:          'Diagnosing',         // Tech actively diagnosing
  IN_PROGRESS:         'In Progress',        // Tech working
  PARTS_ORDERED:       'Parts Ordered',      // Tech or office
  PARTS_ARRIVED:       'Parts Arrived',      // Office confirms parts in
  COMPLETE:            'Complete',           // Tech — triggers PDF + rating
  FOLLOW_UP_REQUIRED:  'Follow-Up Required', // Office
  CANNOT_REPAIR:       'Cannot Repair',      // Office
  CANCELLED:           'Cancelled',          // Office only
}

// Tech can set:
TECH_STATUSES = ['Dispatched','On Site','Diagnosing','In Progress','Parts Ordered','Complete']

// Office can set all statuses
```

Notification rule: Every status change → Customer (email + SMS) + Submitter (email + SMS)
Exception: ACKNOWLEDGED → Submitter only, NOT customer

---

## Notification SMS Templates

```javascript
const SMS = {
  RECEIVED:           (sr) => `Durante Equipment received SR-${sr.id} for ${sr.equipment}. Track: ${sr.trackingUrl}`,
  ACKNOWLEDGED:       (sr) => `SR-${sr.id} acknowledged. A tech will be scheduled shortly.`,
  SCHEDULED:          (sr) => `Service scheduled for ${sr.scheduledDate}. SR-${sr.id}. Track: ${sr.trackingUrl}`,
  DISPATCHED:         (sr) => `Tech ${sr.techFirstName} is on the way. ETA: ${sr.eta}. SR-${sr.id}`,
  ON_SITE:            (sr) => `Your Durante technician has arrived on site. SR-${sr.id}`,
  DIAGNOSING:         (sr) => `Our tech is diagnosing your equipment. SR-${sr.id}`,
  IN_PROGRESS:        (sr) => `Work is underway on your equipment. SR-${sr.id}`,
  PARTS_ORDERED:      (sr) => `Parts ordered. Est. arrival: ${sr.eta}. SR-${sr.id}`,
  PARTS_ARRIVED:      (sr) => `Parts arrived — rescheduling your service. SR-${sr.id}`,
  COMPLETE:           (sr) => `Service complete on ${sr.equipment}. Issue: ${sr.summary}. Rate us: ${sr.ratingUrl}`,
  FOLLOW_UP_REQUIRED: (sr) => `A follow-up visit is needed: ${sr.notes}. We will be in touch. SR-${sr.id}`,
  CANNOT_REPAIR:      (sr) => `Unable to complete repair on SR-${sr.id}. Please call: ${process.env.DURANTE_OFFICE_PHONE}`,
  CANCELLED:          (sr) => `SR-${sr.id} has been cancelled. Questions? Call ${process.env.DURANTE_OFFICE_PHONE}`,
}
```

Email templates: HTML files in `/server/templates/emails/` — one per status.
Variables: `{{SR_ID}}` `{{COMPANY_NAME}}` `{{CONTACT_NAME}}` `{{EQUIPMENT}}`
`{{TECH_NAME}}` `{{ETA}}` `{{SCHEDULED_DATE}}` `{{SUMMARY}}` `{{TECH_NOTES}}`
`{{TRACKING_URL}}` `{{RATING_URL}}` `{{OFFICE_PHONE}}`

---

## Auth System

- Name dropdown + 4-digit PIN
- Server validates: find by Full_Name in Techs sheet, bcrypt.compare
- Returns JWT: `{ techId, name, role, email }` — expires 8h
- Stored in localStorage, sent as `Authorization: Bearer <token>`
- Adding techs: office form → auto-generate PIN → SMS to tech's phone

---

## The Four Interfaces

### /submit — Entry Form (no login)
Fields: Company Name, Contact Name, Contact Phone, Contact Email, Site Address,
Customers Need, Asset Number, Equipment Description, Problem Description,
Submitter Name, Submitter Phone, Photos (up to 4)
On submit: generate SR_ID, derive submitter email, write to sheets,
fire RECEIVED notifications, show confirmation with tracking URL

### /tech — Tech Mobile App (login required, Role: Tech)
- My Requests list (assigned to me)
- SR detail with status buttons (TECH_STATUSES only)
- Unit number field, notes field
- Mark Complete: notes required + optional photo
- Mobile-first, large tap targets

### /office — Office Dashboard (login required, Role: Office)
- All SRs table, sortable, color-coded by age (green/yellow/red)
- Full SR detail + StatusHistory timeline
- Assign tech, override any status, internal notes
- Manual re-send notifications, Add Tech form
- Escalation view (overdue SRs highlighted red)
- Filters: status, tech, date range, company

### /track — Public Tracking Page (no login)
- URL: /track/SR-2026-0042
- Shows: current status, timeline, equipment info, tech first name, ETA
- Does NOT show: internal notes, charges, operator issue flag
- Durante branded, mobile-friendly
- Rate-limited public endpoint

---

## Completion Flow

1. Tech taps Mark Complete → must enter Tech Notes (required)
2. Optional completion photo uploaded to Google Drive
3. Status COMPLETE written to sheets
4. Fires: customer email (with PDF) + customer SMS + submitter email + submitter SMS
5. PDF generated (pdfkit): Durante header, SR details, issue, resolution, tech, timestamps
6. PDF saved to Google Drive → URL written to sheet
7. Rating link: /rate/SR-ID/TOKEN (one-time token, writes 1–5 to sheet)

---

## Automation

Escalation cron (daily 8 AM ET):
- SRs not Complete/Cancelled/Cannot Repair AND Status_Updated_At > 3 days ago
- Alert email to: erivera, nbalmaseda, jirwin @duranteequip.com
- Set Escalation_Flag = TRUE

Daily digest cron (daily 7 AM ET):
- To: erivera@duranteequip.com, nbalmaseda@duranteequip.com
- Open SRs by status, completed yesterday, new today, escalated SRs

---

## Dependencies

Server: express, googleapis, @microsoft/microsoft-graph-client, isomorphic-fetch,
@ringcentral/sdk, pdfkit, jsonwebtoken, bcryptjs, node-cron, multer, cors, dotenv, uuid

Client (all 4 apps): react 18, vite 5, tailwindcss 3, react-router-dom 6, axios

---

## Durante Branding

Primary: #E31837 (red) | Secondary: #1A1A1A | Accent: #FFFFFF
Font: system sans-serif | Tagline: "Old School Values. New School Speed."

---

## Phased Build Plan

### PHASE 1 — Foundation & Data Layer
- [ ] Monorepo init (root package.json with workspaces)
- [ ] Express server setup with dotenv, cors, basic routes
- [ ] .env.example and .gitignore
- [ ] sheets.js — read rows, append rows, update by SR_ID
- [ ] idGenerator.js — SR-YYYY-NNNN format
- [ ] emailDeriver.js — firstinitial+lastname@duranteequip.com
- [ ] statusFlow.js — valid statuses and role permissions
- [ ] POST /api/submit — validate, generate ID, write to both sheets
- [ ] GET /api/track/:id — public, reads SR + StatusHistory
- [ ] GET /api/requests — protected, returns all SRs
- [ ] PATCH /api/requests/:id/status — protected, updates status

Verify: Submit creates rows in both sheets, SR_ID correct, tracking URL written ✓

### PHASE 2 — Notifications
- [ ] ringcentral.js — JWT auth, send SMS
- [ ] outlook.js — Microsoft Graph, send email
- [ ] /server/templates/emails/ — 13 HTML templates
- [ ] notifications.js — template engine + dispatch
- [ ] Wire to /api/submit (RECEIVED fires on entry)
- [ ] Wire to /api/requests/:id/status (all status changes)

Verify: Submit → customer + submitter get email + SMS. ACKNOWLEDGED → submitter only ✓

### PHASE 3 — Tech Mobile App (/client/tech)
- [ ] Vite + React + Tailwind setup
- [ ] Login (name dropdown + PIN)
- [ ] JWT auth (store + attach to requests)
- [ ] My Requests list (assigned SRs only)
- [ ] SR detail page
- [ ] Status buttons (TECH_STATUSES only)
- [ ] Unit number + notes fields
- [ ] Mark Complete flow (notes required, photo optional)
- [ ] Mobile-first design

Verify: Login works, status update fires notifications, cannot set office-only statuses ✓

### PHASE 4 — Office Dashboard (/client/office)
- [ ] Vite + React + Tailwind setup
- [ ] Login (Role: Office)
- [ ] SR table with age color coding
- [ ] SR detail + StatusHistory timeline
- [ ] Assign tech, override status, internal notes
- [ ] Manual re-send notification
- [ ] Add Tech form (generates + SMS PIN)
- [ ] Escalation view
- [ ] Filters

Verify: All SRs visible, assign tech works, internal notes not in notifications ✓

### PHASE 5 — Entry Form & Public Tracking (/client/submit + /client/track)
- [ ] /submit: Vite + React + Tailwind, full form, photo upload, confirmation screen
- [ ] /track: Vite + React + Tailwind, status badge, timeline, Durante branding

Verify: Form submission creates SR, tracking page shows correct data, mobile-friendly ✓

### PHASE 6 — Completion PDF & Satisfaction Rating
- [ ] pdf.js — pdfkit, Durante header, full SR summary
- [ ] Save PDF to Google Drive, write URL to sheet
- [ ] Attach PDF to completion email
- [ ] Rating endpoint + page (/rate/:id/:token)
- [ ] One-time token logic
- [ ] Write rating to sheet

Verify: Complete fires PDF email, rating link works once, score saved ✓

### PHASE 7 — Automation, Polish & Deployment
- [ ] Escalation cron (8 AM ET daily)
- [ ] Daily digest cron (7 AM ET daily)
- [ ] Rate limiting on public endpoints
- [ ] Input sanitization
- [ ] netlify.toml config
- [ ] Environment variables in Netlify dashboard
- [ ] Full end-to-end test: submit → complete → PDF → rating
- [ ] Mobile device test

Verify: Full workflow passes, escalation fires, deployed to production URL ✓

---

## Standing Rules for Every Claude Code Session

1. Read this file first before writing any code
2. Work one Phase at a time — never skip ahead
3. Pass all verification items before starting next phase
4. Never hardcode credentials, phone numbers, emails, or URLs
5. Always use environment variables for all config values
6. Never commit .env or Google service account JSON
7. Google Sheet columns: append only — never insert or reorder
8. StatusHistory is append-only — never update existing rows
9. Techs sheet is source of truth for all user management
10. Keep .env.example updated when new variables are added
