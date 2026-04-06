const mongoose = require("mongoose");

// Attendance records a single check-in: one document per user per event.
// The unique index on (user, event) prevents double check-ins at the DB level.
const attendanceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    checkedInAt: {
      type: Date,
      default: Date.now,
    },
    // Stores the raw QR code value used during check-in (empty string for manual check-ins)
    qrCodeValue: {
      type: String,
      default: "",
    },
    // Private notes added by the event owner about this attendee
    ownerNotes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

// Enforce one attendance record per user per event at the database level
attendanceSchema.index({ user: 1, event: 1 }, { unique: true });

// Returns a plain object { userId: checkedInAt } for all attendees of an event.
// Used by the check-in page to quickly look up whether a given user has checked in.
attendanceSchema.statics.findMapForEvent = async function (eventId) {
  const attendances = await this.find({ event: eventId }).select("user checkedInAt");
  const map = {};
  attendances.forEach((a) => { map[a.user.toString()] = a.checkedInAt; });
  return map;
};

// Returns { userId: { checkedInAt, ownerNotes } } for all attendees of an event.
// Used when both timestamps and owner notes are needed (check-in page, attendance page).
attendanceSchema.statics.findFullMapForEvent = async function (eventId) {
  const attendances = await this.find({ event: eventId }).select("user checkedInAt ownerNotes");
  const map = {};
  attendances.forEach((a) => {
    map[a.user.toString()] = { checkedInAt: a.checkedInAt, ownerNotes: a.ownerNotes || "" };
  });
  return map;
};

// Updates the owner's notes for a specific attendee.
// Uses upsert so notes can be added even before the attendee has checked in.
// $setOnInsert ensures checkedInAt stays null on insert (no fake check-in timestamp).
attendanceSchema.statics.updateOwnerNotes = function (userId, eventId, notes) {
  return this.findOneAndUpdate(
    { user: userId, event: eventId },
    {
      $set: { ownerNotes: notes },
      $setOnInsert: { checkedInAt: null, qrCodeValue: "" },
    },
    { upsert: true, returnDocument: "after" }
  );
};

// Total number of checked-in attendees for an event.
// Excludes notes-only records (checkedInAt: null) created by updateOwnerNotes.
attendanceSchema.statics.countForEvent = function (eventId) {
  return this.countDocuments({ event: eventId, checkedInAt: { $ne: null } });
};

// Number of check-ins that occurred today (since midnight) for an event
attendanceSchema.statics.countTodayForEvent = function (eventId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return this.countDocuments({ event: eventId, checkedInAt: { $gte: startOfDay } });
};

// Returns the attendance record for a specific user+event pair only if actually checked in
// (checkedInAt != null). Notes-only records (checkedInAt: null) are intentionally excluded
// so they don't block a real check-in.
attendanceSchema.statics.findExisting = function (userId, eventId) {
  return this.findOne({ user: userId, event: eventId, checkedInAt: { $ne: null } });
};

// Checks a user in. Uses upsert so that if a notes-only record (checkedInAt: null) already
// exists — created by updateOwnerNotes before actual check-in — it is updated in place
// rather than triggering a unique-index violation from a duplicate create().
attendanceSchema.statics.checkIn = function (userId, eventId, qrCodeValue = "") {
  return this.findOneAndUpdate(
    { user: userId, event: eventId },
    { $set: { checkedInAt: new Date(), qrCodeValue } },
    { upsert: true, returnDocument: "after" }
  );
};

// Deletes the attendance record (undoes a check-in)
attendanceSchema.statics.withdraw = function (userId, eventId) {
  return this.findOneAndDelete({ user: userId, event: eventId });
};

// Returns all attendance records for a user (used on My RSVPs to show check-in status)
attendanceSchema.statics.findByUser = function (userId) {
  return this.find({ user: userId }).select("event checkedInAt");
};

// Deletes all attendance records for an event (used when the event itself is deleted)
attendanceSchema.statics.deleteByEvent = function (eventId) {
  return this.deleteMany({ event: eventId });
};

// Updates the check-in timestamp for an existing attendance record
attendanceSchema.statics.updateTime = function (userId, eventId, time) {
  return this.findOneAndUpdate(
    { user: userId, event: eventId },
    { checkedInAt: new Date(time) },
    { returnDocument: "after" }
  );
};

module.exports = mongoose.model("Attendance", attendanceSchema);
