const mongoose = require("mongoose");

const rsvpSchema = new mongoose.Schema(
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
    status: {
      type: String,
      enum: ["confirmed", "waitlist"],
      required: true,
    },
    notes: {
      type: String,
      default: null,
      maxlength: 100,
    },
  },
  { timestamps: true }
);

// Enforce one RSVP per user per event at the database level
rsvpSchema.index({ user: 1, event: 1 }, { unique: true });

// Returns all RSVPs for an event, populated with user details, newest first.
rsvpSchema.statics.getParticipantsByEvent = function (eventOrId) {
  const eventId = eventOrId && eventOrId._id ? eventOrId._id : eventOrId;
  return this.find({ event: eventId })
    .populate("user")
    .sort({ createdAt: -1 });
};

// Total RSVP count across multiple events
rsvpSchema.statics.countByEventIds = function (eventIds) {
  if (!eventIds || eventIds.length === 0) return 0;
  return this.countDocuments({ event: { $in: eventIds } });
};

// Waitlist count across multiple events
rsvpSchema.statics.countWaitlistByEventIds = function (eventIds) {
  if (!eventIds || eventIds.length === 0) return 0;
  return this.countDocuments({ event: { $in: eventIds }, status: "waitlist" });
};

// Returns the most recent RSVPs across multiple events, with user name and event title populated.
rsvpSchema.statics.getRecentActivityByEventIds = function (eventIds, limit = 5) {
  if (!eventIds || eventIds.length === 0) return [];
  return this.find({ event: { $in: eventIds } })
    .populate("user", "name")
    .populate("event", "title")
    .sort({ updatedAt: -1 })
    .limit(limit);
};

// Looks up a single RSVP by its document ID
rsvpSchema.statics.getRSVPById = function (id) {
  return this.findById(id);
};

// Deletes a single RSVP by its document ID
rsvpSchema.statics.deleteRSVPById = function (id) {
  return this.findByIdAndDelete(id);
};

// Returns RSVPs for an event, optionally filtered to a specific set of user IDs
rsvpSchema.statics.findForEvent = function (eventId, userIds = null) {
  const query = { event: eventId };
  if (userIds) query.user = { $in: userIds };
  return this.find(query).populate("user", "name email").sort({ createdAt: -1 });
};

// Total number of RSVPs for a single event
rsvpSchema.statics.countForEvent = function (eventId) {
  return this.countDocuments({ event: eventId });
};

// Number of new RSVPs created today for an event
rsvpSchema.statics.countTodayForEvent = function (eventId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return this.countDocuments({ event: eventId, createdAt: { $gte: startOfDay } });
};

// Returns the confirmed RSVP for a specific user+event pair, or null if not confirmed
rsvpSchema.statics.findConfirmed = function (userId, eventId) {
  return this.findOne({ user: userId, event: eventId, status: "confirmed" });
};

// Updates the status of an RSVP (confirmed/waitlist) and returns the updated document
rsvpSchema.statics.updateStatus = function (userId, eventId, status) {
  return this.findOneAndUpdate(
    { user: userId, event: eventId },
    { status },
    { returnDocument: "after" }
  );
};

// Returns all RSVPs for a user, with each event's details and owner name populated
rsvpSchema.statics.findByUser = function (userId) {
  return this.find({ user: userId }).populate({ path: "event", populate: { path: "owner", select: "name" } });
};

// Returns the RSVP for a specific user+event pair (any status), or null
rsvpSchema.statics.findByUserAndEvent = function (userId, eventId) {
  return this.findOne({ user: userId, event: eventId });
};

// Number of confirmed (non-waitlist) RSVPs for an event
rsvpSchema.statics.countConfirmed = function (eventId) {
  return this.countDocuments({ event: eventId, status: "confirmed" });
};

// Creates a new RSVP document
rsvpSchema.statics.createRSVP = function (userId, eventId, status, notes = null) {
  return this.create({ user: userId, event: eventId, status, notes });
};

// Deletes the RSVP for a specific user+event pair
rsvpSchema.statics.deleteByUserAndEvent = function (userId, eventId) {
  return this.findOneAndDelete({ user: userId, event: eventId });
};

// Deletes all RSVPs for an event
rsvpSchema.statics.deleteByEvent = function (eventId) {
  return this.deleteMany({ event: eventId });
};

// Returns the earliest waitlisted RSVP for an event (FIFO order).
rsvpSchema.statics.findNextWaitlisted = function (eventId) {
  return this.findOne({ event: eventId, status: "waitlist" }).sort({ createdAt: 1 });
};

// Promotes a waitlisted RSVP to confirmed status
rsvpSchema.statics.promoteToConfirmed = function (rsvpId) {
  return this.findByIdAndUpdate(rsvpId, { status: "confirmed" }, { returnDocument: "after" });
};

// Returns the top RSVPed events by RSVP count, for a given set of event IDs.
rsvpSchema.statics.getTopRSVPedEventsByIds = async function (eventIds = [], limit = 3) {
  if (!eventIds || eventIds.length === 0) return [];
  const mongoose = require("mongoose");
  const objectIds = eventIds.map((id) => (typeof id === "string" ? mongoose.Types.ObjectId(id) : id));

  const pipeline = [
    { $match: { event: { $in: objectIds } } },
    { $group: { _id: "$event", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: Math.max(1, Number(limit) || 3) },
    {
      $lookup: {
        from: "events",
        localField: "_id",
        foreignField: "_id",
        as: "event"
      }
    },
    { $unwind: { path: "$event", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        eventId: "$_id",
        count: 1,
        "event._id": 1,
        "event.title": 1,
        "event.startDate": 1,
        "event.category": 1,
        "event.venue": 1
      }
    }
  ];

  return this.aggregate(pipeline);
};

// Returns the RSVP status for a list of event IDs for a specific user.
rsvpSchema.statics.findStatusesByEventIds = function (eventIds) {
  if (!eventIds || eventIds.length === 0) return Promise.resolve([]);
  return this.find({ event: { $in: eventIds } }).select("event status");
};

// Returns RSVPs for a user filtered to a specific set of event IDs
rsvpSchema.statics.findByUserAndEventIds = function (userId, eventIds) {
  return this.find({ user: userId, event: { $in: eventIds } });
};

// Returns all RSVPs for a user with each event's endDate populated.
rsvpSchema.statics.findAllByUserWithEvent = function (userId) {
  return this.find({ user: userId }).populate("event", "endDate");
};

module.exports = mongoose.model("RSVP", rsvpSchema);
