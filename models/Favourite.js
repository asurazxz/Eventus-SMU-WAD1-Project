const mongoose = require("mongoose");

const favouriteSchema = new mongoose.Schema(
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
    notes: {
      type: String,
      default: "",
    },
    reminder: {
      type: Boolean,
      default: false,
    },
    tag: {
      type: String,
      enum: ["", "social", "educational", "professional"],
      default: "",
    },
  },
  { timestamps: true }
);

favouriteSchema.statics.getAllByUser = function (userId) {
  return this.find({ user: userId }).populate({ path: "event", populate: { path: "owner", select: "name" } });
};

favouriteSchema.statics.findByUserAndEvent = function (userId, eventId) {
  return this.findOne({ user: userId, event: eventId });
};

favouriteSchema.statics.findByIdAndUser = function (favId, userId) {
  return this.findOne({ _id: favId, user: userId });
};

favouriteSchema.statics.addFavourite = function (userId, eventId, options = {}) {
  return this.create({
    user: userId,
    event: eventId,
    reminder: options.reminder || false,
    tag: options.tag || "",
  });
};

// Returns favourites with reminder=true whose event starts within (from, to).
favouriteSchema.statics.getUpcomingReminders = async function (userId, from, to) {
  const favs = await this.find({ user: userId, reminder: true }).populate({
    path: "event",
    select: "title startDate",
    match: { startDate: { $gte: from, $lt: to } },
  });
  return favs.filter((f) => f.event !== null);
};

favouriteSchema.statics.updateNotes = function (favouriteId, userId, notes) {
  return this.findOneAndUpdate({ _id: favouriteId, user: userId }, { notes });
};

favouriteSchema.statics.updateReminder = function (favouriteId, userId, reminder) {
  return this.findOneAndUpdate({ _id: favouriteId, user: userId }, { reminder }, { returnDocument: "after" });
};

favouriteSchema.statics.updateTag = function (favouriteId, userId, tag) {
  return this.findOneAndUpdate({ _id: favouriteId, user: userId }, { tag });
};

favouriteSchema.statics.removeFavourite = function (favouriteId, userId) {
  return this.findOneAndDelete({ _id: favouriteId, user: userId });
};

// Deletes all favourites for an event (used when the event itself is deleted)
favouriteSchema.statics.deleteByEvent = function (eventId) {
  return this.deleteMany({ event: eventId });
};

// Deletes all favourites saved by a user (used when the user deletes their account)
favouriteSchema.statics.deleteByUser = function (userId) {
  return this.deleteMany({ user: userId });
};

module.exports = mongoose.model("Favourite", favouriteSchema);
