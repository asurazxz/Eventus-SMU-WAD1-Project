const mongoose = require("mongoose");

const RSVPActivitySchema = new mongoose.Schema(
  {
    rsvp: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RSVP",
      required: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      enum: ["cancelled", "deleted"],
      required: true,
    },
  },
  { timestamps: true }
);

// helper to create activity from an RSVP document
RSVPActivitySchema.statics.createFromRSVP = function (rsvpDoc, action) {
  const rec = new this({
    rsvp: rsvpDoc._id,
    event: rsvpDoc.event,
    user: rsvpDoc.user,
    action,
  });
  return rec.save();
};

// Deletes all activity records for an event
RSVPActivitySchema.statics.deleteByEvent = function (eventId) {
  return this.deleteMany({ event: eventId });
};

// Deletes all RSVPActivity records
RSVPActivitySchema.statics.deleteByUser = function (userId) {
  return this.deleteMany({ user: userId });
};

RSVPActivitySchema.statics.getRecentByEventIds = function (eventIds, limit = 10) {
  return this.find({ event: { $in: eventIds } })
    .populate("user", "name")
    .populate("event", "title")
    .sort({ createdAt: -1 })
    .limit(limit);
};

module.exports = mongoose.model("RSVPActivity", RSVPActivitySchema);