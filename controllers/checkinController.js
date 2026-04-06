const mongoose = require("mongoose");
const RSVP = require("../models/RSVP");
const Attendance = require("../models/Attendance");
const User = require("../models/User");
const { Event } = require("../models/Event");

// GET /checkin/:eventId
// Renders the check-in dashboard for an event, with attendee list and live stats.
// Supports optional ?search= query to filter attendees by name/email.
exports.showCheckinPage = async (req, res) => {
  const { eventId } = req.params;
  const searchQuery = req.query.search?.trim() || "";

  if (!mongoose.isValidObjectId(eventId)) {
    return res.status(400).send("Invalid event ID.");
  }

  try {
    const event = await Event.getById(eventId);
    if (!event) return res.status(404).send("Event not found.");

    // Fetch all four stats concurrently
    const [totalRsvps, checkedInCount, newRsvpsToday, newCheckinsToday] = await Promise.all([
      RSVP.countForEvent(eventId),
      Attendance.countForEvent(eventId),
      RSVP.countTodayForEvent(eventId),
      Attendance.countTodayForEvent(eventId),
    ]);

    // Only resolve user IDs from the search string if a query is present
    const userIds = searchQuery ? await User.findMatchingIds(searchQuery) : null;

    // Fetch RSVPs (optionally filtered by matching user IDs) and the attendance map in parallel
    const [rsvps, attendanceMap] = await Promise.all([
      RSVP.findForEvent(eventId, userIds),
      Attendance.findFullMapForEvent(eventId), // returns { userId: { checkedInAt, ownerNotes } }
    ]);

    // Build the attendee list by merging RSVP data with attendance data
    const attendees = rsvps.map((r) => {
      const userId = r.user?._id?.toString();
      const attendance = attendanceMap[userId]; // undefined if not yet checked in
      const checkedInAt = attendance?.checkedInAt;
      let status;
      if (checkedInAt) status = "Checked-In";
      else if (r.status === "waitlist") status = "Waitlist";
      else status = "Pending";

      return {
        userId,
        name: r.user?.name || "Unknown",
        email: r.user?.email || "",
        rsvpNotes: r.notes || "",
        status,
        // Human-readable time displayed in the UI
        checkInTime: checkedInAt
          ? checkedInAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
          : "—",
        // ISO string used by the inline edit form (datetime-local input)
        checkInIso: checkedInAt ? checkedInAt.toISOString() : null,
        ownerNotes: attendance?.ownerNotes || "",
      };
    });

    res.render("checkin/scan", {
      title: "Check In",
      eventId,
      event,
      stats: { totalRsvps, checkedInCount, newRsvpsToday, newCheckinsToday },
      attendees,
      searchQuery,
      query: req.query,
    });
  } catch (err) {
    console.error("showCheckinPage error:", err);
    res.status(500).send("Server error");
  }
};

// POST /checkin/:eventId
// Checks in a user by userId (from the attendee list button) or by a free-text identifier
// (name/email typed manually). Responds with JSON if the request came from fetch/XHR,
// otherwise redirects back to the check-in page.
exports.checkInUser = async (req, res) => {
  const { eventId } = req.params;
  const { userId, identifier } = req.body;
  const search = req.query.search || "";
  // Detect AJAX/fetch requests so we can return JSON instead of a redirect
  const wantsJson = req.xhr || req.headers.accept?.includes("application/json");

  if (!mongoose.isValidObjectId(eventId)) {
    return wantsJson
      ? res.status(400).json({ success: false, message: "Invalid event ID." })
      : res.status(400).send("Invalid event ID.");
  }

  try {
    let user;
    // Prefer direct userId lookup (from the list); fall back to name/email search
    if (userId && mongoose.isValidObjectId(userId)) {
      user = await User.getUserById(userId);
    } else if (identifier?.trim()) {
      user = await User.findByIdentifier(identifier);
    }

    if (!user) {
      return wantsJson
        ? res.status(404).json({ success: false, message: "No user found with that name or email." })
        : res.redirect(`/checkin/${eventId}?error=notfound&search=${search}`);
    }

    // Only confirmed RSVPs may check in — waitlisted attendees are not admitted
    const rsvp = await RSVP.findConfirmed(user._id, eventId);
    if (!rsvp) {
      return wantsJson
        ? res.status(403).json({ success: false, message: "This person doesn't have a confirmed RSVP." })
        : res.redirect(`/checkin/${eventId}?error=norsvp&search=${search}`);
    }

    // Prevent double check-in (Attendance has a unique index on user+event)
    const existing = await Attendance.findExisting(user._id, eventId);
    if (existing) {
      return wantsJson
        ? res.status(409).json({ success: false, message: "This person has already been checked in." })
        : res.redirect(`/checkin/${eventId}?error=already&search=${search}`);
    }

    const attendance = await Attendance.checkIn(user._id, eventId);

    return wantsJson
      ? res.json({ success: true, name: user.name, userId: user._id.toString(), checkedInAt: attendance.checkedInAt })
      : res.redirect(`/checkin/${eventId}?success=1&search=${search}`);
  } catch (err) {
    console.error("checkInUser error:", err);
    return wantsJson
      ? res.status(500).json({ success: false, message: "Server error" })
      : res.status(500).send("Server error");
  }
};

// POST /checkin/:eventId/qr
// Checks in a user via QR code scan. The QR value is expected to be "userId:eventId".
// Always returns JSON (this endpoint is called by the browser's QR scanner script).
exports.checkInByQr = async (req, res) => {
  const { eventId } = req.params;
  const { qrValue } = req.body;

  if (!mongoose.isValidObjectId(eventId)) return res.status(400).json({ success: false, message: "Invalid event ID." });
  if (!qrValue) return res.status(400).json({ success: false, message: "No QR value provided" });

  // QR codes are encoded as "userId:eventId"
  const parts = qrValue.split(":");
  if (parts.length !== 2) return res.status(400).json({ success: false, message: "Invalid QR code format" });

  const [qrUserId, qrEventId] = parts;

  if (!mongoose.isValidObjectId(qrUserId) || !mongoose.isValidObjectId(qrEventId)) {
    return res.status(400).json({ success: false, message: "Invalid QR code" });
  }

  // Ensure the QR code belongs to this event (prevent cross-event scanning)
  if (qrEventId !== eventId) {
    return res.status(403).json({ success: false, message: "This QR code is not valid for this event" });
  }

  try {
    const user = await User.getUserById(qrUserId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const rsvp = await RSVP.findConfirmed(user._id, eventId);
    if (!rsvp) return res.status(403).json({ success: false, message: "No confirmed RSVP" });

    const existing = await Attendance.findExisting(user._id, eventId);
    if (existing) return res.status(409).json({ success: false, message: "Already checked in" });

    const attendance = await Attendance.checkIn(user._id, eventId, qrValue);

    return res.json({ success: true, name: user.name, userId: user._id.toString(), checkedInAt: attendance.checkedInAt });
  } catch (err) {
    console.error("checkInByQr error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// POST /checkin/:eventId/withdraw
// Removes a check-in record (undo check-in). Returns JSON.
exports.withdrawCheckin = async (req, res) => {
  const { eventId } = req.params;
  const { userId } = req.body;

  if (!mongoose.isValidObjectId(eventId)) return res.status(400).json({ success: false, message: "Invalid event ID." });
  if (!userId || !mongoose.isValidObjectId(userId)) return res.status(400).json({ success: false, message: "Invalid user ID." });

  try {
    const user = await User.getUserById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const deleted = await Attendance.withdraw(userId, eventId);
    if (!deleted) return res.status(404).json({ success: false, message: "No check-in record found." });

    return res.json({ success: true, name: user.name, userId: user._id.toString() });
  } catch (err) {
    console.error("withdrawCheckin error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// PATCH /checkin/:eventId/update-time
// Updates the checkedInAt timestamp for an existing attendance record.
// Used by the inline edit form on the check-in dashboard.
exports.updateCheckinTime = async (req, res) => {
  const { eventId } = req.params;
  const { userId, checkedInAt } = req.body;

  if (!mongoose.isValidObjectId(eventId)) return res.status(400).json({ success: false, message: "Invalid event ID." });
  if (!userId || !mongoose.isValidObjectId(userId)) return res.status(400).json({ success: false, message: "Invalid user ID." });
  if (!checkedInAt || isNaN(Date.parse(checkedInAt))) return res.status(400).json({ success: false, message: "Invalid date/time." });

  try {
    const updated = await Attendance.updateTime(userId, eventId, checkedInAt);
    if (!updated) return res.status(404).json({ success: false, message: "No check-in record found." });
    return res.json({ success: true, checkedInAt: updated.checkedInAt });
  } catch (err) {
    console.error("updateCheckinTime error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// PATCH /checkin/:eventId/owner-notes
// Saves the owner's private notes for a specific attendee's attendance record.
// Only works if the attendee has a check-in record (Attendance document must exist).
exports.updateOwnerNotes = async (req, res) => {
  const { eventId } = req.params;
  const { userId, notes } = req.body;

  if (!mongoose.isValidObjectId(eventId)) return res.status(400).json({ success: false, message: "Invalid event ID." });
  if (!userId || !mongoose.isValidObjectId(userId)) return res.status(400).json({ success: false, message: "Invalid user ID." });

  const sanitized = (notes || "").trim().slice(0, 500);

  try {
    const updated = await Attendance.updateOwnerNotes(userId, eventId, sanitized);
    if (!updated) return res.status(404).json({ success: false, message: "Failed to save notes." });
    return res.json({ success: true, ownerNotes: updated.ownerNotes });
  } catch (err) {
    console.error("updateOwnerNotes error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// POST /checkin/:eventId/update-rsvp
// Manually promotes or demotes an attendee's RSVP status (confirmed ↔ waitlist).
exports.updateRsvpStatus = async (req, res) => {
  const { eventId } = req.params;
  const { userId, status } = req.body;

  if (!mongoose.isValidObjectId(eventId)) return res.status(400).json({ success: false, message: "Invalid event ID." });
  if (!userId || !mongoose.isValidObjectId(userId)) return res.status(400).json({ success: false, message: "Invalid user ID." });
  if (!["confirmed", "waitlist"].includes(status)) return res.status(400).json({ success: false, message: "Invalid status. Use 'confirmed' or 'waitlist'." });

  try {
    const updated = await RSVP.updateStatus(userId, eventId, status);
    if (!updated) return res.status(404).json({ success: false, message: "No RSVP found." });
    return res.json({ success: true, status: updated.status });
  } catch (err) {
    console.error("updateRsvpStatus error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// GET /checkin/:eventId/export
// Streams a CSV file of all RSVPs with their check-in status for download.
exports.exportCheckinCsv = async (req, res) => {
  const { eventId } = req.params;
  if (!mongoose.isValidObjectId(eventId)) return res.status(400).send("Invalid event ID.");

  try {
    const event = await Event.getById(eventId);
    if (!event) return res.status(404).send("Event not found.");

    const [rsvps, checkedInMap] = await Promise.all([
      RSVP.findForEvent(eventId),
      Attendance.findMapForEvent(eventId),
    ]);

    // Build rows: header first, then one row per RSVP
    const rows = [["Name", "Email", "Status", "RSVP Status", "Check-In Time"]];
    rsvps.forEach((r) => {
      const uid = r.user?._id?.toString();
      const checkedAt = checkedInMap[uid];
      rows.push([
        r.user?.name || "",
        r.user?.email || "",
        checkedAt ? "Checked-In" : r.status === "waitlist" ? "Waitlist" : "Pending",
        r.status,
        checkedAt ? checkedAt.toISOString() : "",
      ]);
    });

    // Escape double-quotes inside cell values and wrap every cell in quotes
    const csv = rows
      .map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(","))
      .join("\r\n");

    const filename = `checkin-${event.title.replace(/[^a-z0-9]/gi, "-")}-${Date.now()}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="' + filename + '"');
    res.send(csv);
  } catch (err) {
    console.error("exportCheckinCsv error:", err);
    res.status(500).send("Server error");
  }
};
