# Eventus — SMU IS113 WAD1 Group 4 Project

An event management platform built with Node.js, Express, MongoDB, and EJS.
Part of AY2025/2026 IS113 WAD1 Group Project to demonstrate understanding of web applications using JavaScript and database CRUD 

**Course**: IS113 Web Application Development 1 — Group 4
- Group members:
  - Denzel Marani https://github.com/asurazxz 
  - Damien Law Yong Chung https://github.com/damienlaww  
  - Joash Law Cho Shuen https://github.com/joashlcs 
  - Ong Guiyun https://github.com/guiyun466 
  - Wong Sue Han Andrea https://github.com/spicyramen-smu 
  - Chen Jianxin https://github.com/cjianxin

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 18+ |
| Framework | Express.js 5.2.1 |
| Database | MongoDB Atlas (Mongoose 9.3.0) |
| Templating | EJS 5 |
| Auth | bcryptjs 3.0.3, express-session, connect-flash |
| Validation | express-validator |

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/asurazxz/WAD1-Project-Group-4.git
cd WAD1-Project-Group-4
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root with the following values:

```env
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>?retryWrites=true&w=majority

SESSION_SECRET=<generate-a-random-string>

PORT=8000
```

To generate a secure `SESSION_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Start the server

```bash
npm start
```

or with auto-restart on file changes:

```bash
nodemon server.js
```

Expected output:
```
Server running on port 8000
MongoDB connected: cluster0.xxxxx.mongodb.net
Database: eventus
```

### 5. Open the app

Navigate to:
```
http://localhost:8000
```
or
```
http://localhost:8000/index.html
```
---

## Prerequisites

- **Node.js** v18 or higher — [Download](https://nodejs.org/)
- **npm** (included with Node.js)
- **MongoDB Atlas** connection string — ask a group member for the shared `.env` file

---

## Project Structure

```
WAD1-Project-Group-4/
├── config/
│   └── db.js                    # MongoDB Atlas connection
├── controllers/
│   ├── authController.js        # Signup, login, logout
│   ├── checkinController.js     # Check-in, QR scan, owner notes, CSV export
│   ├── dashboardController.js   # Dashboard, participants, todos
│   ├── eventController.js       # Event CRUD, favourites, reminder toggle
│   ├── rsvpController.js        # RSVP join, view, cancel, waitlist promote
│   └── profileController.js     # Manages user profile
├── middleware/
│   ├── authMiddleware.js        # requireAuth
│   ├── ownerMiddleware.js       # requireOwner
│   └── requireHasEvents.js      # requireHasEvents (dashboard guard)
├── models/
│   ├── Attendance.js            # Check-in records
│   ├── Event.js                 # Events + CATEGORIES
│   ├── Favourite.js             # Saved events + reminder flag
│   ├── RSVP.js                  # RSVP records + ownerNotes field
│   ├── RSVPActivity.js          # Cancellation log
│   ├── Todo.js                  # Todo items
│   └── User.js                  # Users + auth methods
├── routes/
│   ├── authRoutes.js            # /auth/*
│   ├── checkinRoutes.js         # /checkin/*
│   ├── dashboardRoutes.js       # /dashboard/*, /todos/*
│   ├── eventRoutes.js           # (root) /events/*, /favourites/*
│   ├── profileRoutes.js         # /update, /password, /delete
│   └── rsvpRoutes.js            # /events/my, /events/:id/rsvp
├── views/
│   ├── auth/                    # Login, signup
│   ├── checkin/                 # Check-in dashboard with QR scanner + owner notes
│   ├── dashboard/               # Dashboard, participants, todos, no-events fallback
│   ├── dashboardPartials/       # Sub-header for Dashboard
│   ├── events/                  # Event listing, detail, create, edit, favourites, my RSVPs 
│   ├── profile/                 # Displays profile 
│   └── partials/                # Shared header, footer, flash messages
├── public/
│   ├── css/style.css            # Global styles (purple theme)
│   └── js/
│       ├── main.js              # Nav toggle, responsive tables
│       ├── qrcode.js            # Check-in page client-side logic for QR code generation
│       └── checkin.js           # Check-in page client-side logic for displays
├── .env                         # Environment variables (not tracked by git)
├── .gitignore
├── server.js                    # App entry point
├── README.md                    # Project details
├── package-lock.json
└── package.json
```

---

## AI / LLM Usage Disclosure

In accordance with the IS113 project guidelines, the following parts of this project involved AI/LLM assistance:

| Area | AI Role |
|------|---------|
| UI theme and layout | Generating the Eventbrite-inspired purple theme concept and CSS layout ideas |
| Boilerplate snippets | Starter code patterns |
| Debugging | Explaining error messages and suggesting fixes |
| Post-merge integration | Bug fixes, MVC refactoring, and cross-feature wiring after merging all branches |

Core business logic, route design, schema design, authentication system, and form validation were implemented independently by each team member.

---

## Features

### 1. Authentication & User Profile (Denzel)
- Secure sign-up/login with bcrypt password hashing (10 salt rounds), session management, protected routes
- Profile management: edit name, email, phone, bio; change password (re-hashed via pre-save hook)
- Accessing protected routes when not logged in redirects to login page with redirect-back after login
- Flash messages (success/error/info) shown globally on every page, auto-dismiss after 4s with manual close button
- **Account deletion with full cascade** — the most complex operation in the codebase:
  - Upcoming owned events are hard-deleted along with all their RSVPs, Attendance, Favourites, and RSVPActivity
  - Past owned events are anonymized (`owner → null`) so historical records are preserved and show "Deleted User"
  - Upcoming RSVPs the user holds as an attendee are cancelled and waitlisted users are auto-promoted
  - Past RSVPs and check-in records as an attendee are kept so event owners retain attendance history
  - All remaining user data (Favourites, Todos, RSVPActivity) is deleted, then the User document is deleted and the session is destroyed

### 2. Events (Guiyun)
- Trending events (by top RSVP count)
- Search by title, filter by category, sort by date/name/category
- Create & manage events with full CRUD and form validation (title, venue, description, category, dates, capacity)
- Proper permissions: only owners can edit/delete events
- Cascade delete: deleting an event removes all related RSVPs, Attendance, Favourites, and RSVPActivity records
- Contact organiser via email/phone link on event detail page (combined "Contact" section)
- Event detail shows About Event first, then About Organizer below

### 3. RSVP system (Jianxin)
- RSVP for events (confirmed or waitlisted based on capacity)
- Automatic waitlist promotion when a confirmed RSVP is cancelled
- Automatic waitlist promotion when event capacity is increased
- My RSVPs: upcoming and past RSVPs with check-in status shown side-by-side (two-column layout)
- Owners cannot RSVP to their own events (button greyed out with tooltip)
- RSVP'd state shown on event detail button once already registered

### 4. Favourites (Andrea)
- Save events with personal notes (max 500 characters)
- Reminder toggle: turn reminder on/off from My Favourites page with instant AJAX update and toast confirmation

### 5. User dashboard (Damien)
- Stats overview (upcoming RSVPs and waitlist counts only)
- Event management, participant lists with manual waitlist promote, activity feed
- Post-event attendance view with filter tabs (All / Checked In / No Check-In) and CSV export
- Todo list: personal task tracker with priority (high/medium/low) + deadline sorting; sort order preserved across all actions; form validation
- Sticky dashboard sub-nav

### 6. Check-in dashboard (Joash)
- QR code scanner (QR code generated on attendee side) to check-in, manual check-in
- Owner can add private notes to any RSVP (not limited to checked-in attendees)
- CSV export of attendee details
- Live attendance (participants) statistics

---

<div style="text-align: center;">
  <p>-- END --</p>
</div>
