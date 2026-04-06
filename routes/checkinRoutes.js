const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware");
const { requireEventOwner } = require("../middleware/ownerMiddleware");
const checkinController = require("../controllers/checkinController");

// All check-in routes require both login AND event ownership.
// Export attendee list as a CSV file download
router.get("/checkin/:eventId/export", requireAuth, requireEventOwner, checkinController.exportCheckinCsv);
// Save owner notes for a checked-in attendee
router.patch("/checkin/:eventId/owner-notes", requireAuth, requireEventOwner, checkinController.updateOwnerNotes);
// Undo a check-in (remove attendance record)
router.post("/checkin/:eventId/withdraw", requireAuth, requireEventOwner, checkinController.withdrawCheckin);
// Edit the timestamp of an existing check-in record
router.patch("/checkin/:eventId/update-time", requireAuth, requireEventOwner, checkinController.updateCheckinTime);
// Manually change a participant's RSVP status (confirmed/waitlist)
router.post("/checkin/:eventId/update-rsvp", requireAuth, requireEventOwner, checkinController.updateRsvpStatus);
// Render the check-in dashboard for an event
router.get("/checkin/:eventId", requireAuth, requireEventOwner, checkinController.showCheckinPage);
// Check in a user by name/email
router.post("/checkin/:eventId", requireAuth, requireEventOwner, checkinController.checkInUser);
// Check in a user via QR code scan
router.post("/checkin/:eventId/qr", requireAuth, requireEventOwner, checkinController.checkInByQr);

module.exports = router;
