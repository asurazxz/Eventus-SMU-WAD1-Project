const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware");
const rsvpController = require("../controllers/rsvpController");

// View all events the logged-in user has RSVPed to
router.get("/events/my", requireAuth, rsvpController.getMyEvents);
// RSVP to an event (confirmed if space available, otherwise waitlisted)
router.post("/events/:id/rsvp", requireAuth, rsvpController.joinEvent);
// Cancel an existing RSVP (auto-promotes next waitlisted user if spot was confirmed)
router.post("/events/:id/cancel", requireAuth, rsvpController.cancelRSVP);

module.exports = router;
