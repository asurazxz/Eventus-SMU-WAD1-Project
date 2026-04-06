const RSVP = require("../models/RSVP");
const { Event } = require("../models/Event");
const RSVPActivity = require("../models/RSVPActivity");
const Attendance = require("../models/Attendance");

// GET /events/my
// Shows all events the logged-in user has RSVPed to.
// Splits into upcoming/ongoing (left column) and past (right column, with check-in status).
exports.getMyEvents = async (req, res) => {
  try {
    const userId = req.session.userId;
    let rsvps = await RSVP.findByUser(userId);
    rsvps = rsvps.filter(rsvp => rsvp.event !== null);

    const now = new Date();
    const upcoming = rsvps
      .filter(r => new Date(r.event.endDate) >= now)
      .sort((a, b) => new Date(a.event.startDate) - new Date(b.event.startDate));
    const past = rsvps
      .filter(r => new Date(r.event.endDate) < now)
      .sort((a, b) => new Date(b.event.startDate) - new Date(a.event.startDate));

    // Build { eventId -> checkedInAt } map for all past events at once
    const attendanceRecords = await Attendance.findByUser(userId);
    const checkinMap = {};
    attendanceRecords.forEach(a => { checkinMap[a.event.toString()] = a.checkedInAt; });

    res.render("events/myEvents", { title: "My RSVPs", upcoming, past, checkinMap });
  } catch (err) {
    console.error("getMyEvents error:", err);
    req.flash("error", "Error loading your RSVPs.");
    res.redirect("/events");
  }
};

// POST /events/:id/rsvp
// Registers the logged-in user for an event.
// If the event is full, the user is added to the waitlist instead.
exports.joinEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.session.userId;

    if (req.body.notes && req.body.notes.length > 100) {
      req.flash("error", "RSVP failed: Your notes cannot exceed 100 characters.");
      return res.redirect("/events/" + eventId);
    }

    const event = await Event.getById(eventId);
    if (!event) {
      req.flash("error", "Event not found.");
      return res.redirect("/events");
    }

    // Owners cannot RSVP to their own events
    if (event.owner && event.owner._id.toString() === userId) {
      req.flash("error", "You cannot RSVP to your own event.");
      return res.redirect("/events/" + eventId);
    }

    // Prevent duplicate RSVPs
    const existing = await RSVP.findByUserAndEvent(userId, eventId);
    if (existing) {
      req.flash("error", "You have already RSVPed for this event.");
      return res.redirect("/events/" + eventId);
    }

    // Determine status: confirmed if spots remain, waitlist if the event is full
    const confirmedCount = await RSVP.countConfirmed(eventId);
    const status = confirmedCount < event.maxParticipants ? "confirmed" : "waitlist";

    await RSVP.createRSVP(userId, eventId, status, req.body.notes || null);

    if (status === "confirmed") {
      req.flash("success", "You have successfully RSVPed to this event!");
    } else {
      req.flash("info", "This event is full. You have been added to the waitlist.");
    }
    res.redirect("/events/my");
  } catch (err) {
    console.error(err);
    req.flash("error", "Error processing RSVP.");
    res.redirect("/events");
  }
};

// POST /events/:id/cancel
// Cancels the logged-in user's RSVP for an event.
// If the user had a confirmed spot, the next person on the waitlist is promoted automatically.
exports.cancelRSVP = async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.session.userId;
    const rsvp = await RSVP.findByUserAndEvent(userId, eventId);
    if (!rsvp) {
      req.flash("error", "No RSVP found to cancel.");
      return res.redirect("/events/my");
    }

    // Record the cancellation in RSVPActivity before deleting the RSVP document
    await RSVPActivity.createFromRSVP(rsvp, "cancelled");
    await RSVP.deleteByUserAndEvent(userId, eventId);

    // Auto-promote the earliest waitlisted attendee if the cancelled RSVP was confirmed
    if (rsvp.status === "confirmed") {
      const nextInLine = await RSVP.findNextWaitlisted(eventId);

      if (nextInLine) {
        await RSVP.promoteToConfirmed(nextInLine._id);
      }
    }

    req.flash("success", "Your RSVP has been cancelled.");
    res.redirect("/events/my");
  } catch (err) {
    console.error(err);
    req.flash("error", "Error cancelling RSVP.");
    res.redirect("/events/my");
  }
};
