const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    venue: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    maxParticipants: {
      type: Number,
      required: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

const CATEGORIES = [
  "Music",
  "Sports",
  "Technology",
  "Food & Drink",
  "Arts & Culture",
  "Networking",
  "Education",
  "Health & Wellness",
  "Comedy",
  "Fashion",
  "Gaming",
  "Film & Media",
  "Business",
  "Community",
  "Travel & Outdoors",
  "Charity & Causes",
  "Family & Kids",
  "Religion & Spirituality",
  "Politics",
  "Science",
];

// Search upcoming events with optional filters
eventSchema.statics.searchUpcoming = function ({ q = "", sort = "date_asc", category = "" } = {}) {
  const now = new Date();
  const filter = { startDate: { $gte: now } };
  if (q)        filter.title    = new RegExp(q.trim(), "i");
  if (category) filter.category = category;
  return this.find(filter).sort(SORT_MAP[sort] || SORT_MAP.date_asc).populate("owner", "name");
};

// Get IDs of all upcoming events (for RSVP checks)
eventSchema.statics.getUpcomingIds = function () {
  return this.find({ startDate: { $gte: new Date() } }).select("_id").lean();
};

// Search events by title with optional sort
const SORT_MAP = {
  title_asc: { title: 1 },
  category:  { category: 1, startDate: 1 },
  date_asc:  { startDate: 1 },
};

// Get one event by ID, with owner details populated for display
eventSchema.statics.getById = async function (id) {
  return await this.findById(id).populate("owner", "name email phone about");
};

// Add a new event
eventSchema.statics.addNewEvent = function (eventData) {
  const event = new Event(eventData);
  return event.save();
};

eventSchema.statics.getEventsByOwner = function (ownerId) {
  return this.find({ owner: ownerId }).sort({ startDate: 1 });
};

// Get upcoming events for owner (startDate >= today)
eventSchema.statics.getUpcomingEventsByOwner = function (ownerId, today) {
  return this.find({ owner: ownerId, startDate: { $gte: today } }).sort({ startDate: 1 });
};

// Get past events for owner (endDate < today)
eventSchema.statics.getPastEventsByOwner = function (ownerId, today) {
  return this.find({ owner: ownerId, endDate: { $lt: today } }).sort({ endDate: -1 });
};

// Get one event by ID and owner (for edit/delete authorization)
eventSchema.statics.updateEvent = function (id, updateData) {
  return Event.findByIdAndUpdate(id, updateData, { returnDocument: "after" });
};

// Delete one event by ID and owner (for edit/delete authorization)
eventSchema.statics.deleteEvent = function (id) {
  return Event.findByIdAndDelete(id);
};

// Returns events where startDate <= now <= endDate for the given owner
eventSchema.statics.getOngoingEventsByOwner = function (ownerId, now) {
  const when = now ? new Date(now) : new Date();
  return this.find({
    owner: ownerId,
    startDate: { $lte: when },
    endDate: { $gte: when },
  }).sort({ startDate: 1 });
};

// Total number of events for a single owner (used in dashboard summary)
eventSchema.statics.countByOwner = function (ownerId) {
  return this.countDocuments({ owner: ownerId });
};

// Number of upcoming events for a single owner (used in dashboard summary)
eventSchema.statics.countUpcomingByOwner = function (ownerId, today) {
  return this.countDocuments({ owner: ownerId, startDate: { $gte: today } });
};

// Get IDs and titles of upcoming events for a single owner (used in RSVP checks and dashboard)
eventSchema.statics.getUpcomingIdsByOwner = function (ownerId, today) {
  return this.find({ owner: ownerId, startDate: { $gte: today } }).select("_id title startDate").lean();
};

// Find all events owned by a user that have not yet ended (endDate > now).
// Used during account deletion to identify events that need to be hard-deleted.
eventSchema.statics.findNotEndedByOwner = function (ownerId, now) {
  return this.find({ owner: ownerId, endDate: { $gt: now } });
};

// Set owner to null for all events owned by this user (anonymize on account deletion).
// Only call this after hard-deleting the not-ended events above.
eventSchema.statics.anonymizeOwner = function (ownerId) {
  return Event.updateMany({ owner: ownerId }, { $set: { owner: null } });
};

const Event = mongoose.model("Event", eventSchema);

module.exports = { Event, CATEGORIES };
