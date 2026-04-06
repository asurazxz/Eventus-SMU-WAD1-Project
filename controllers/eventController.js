const { Event, CATEGORIES } = require("../models/Event");
const Favourite = require("../models/Favourite");
const RSVP = require("../models/RSVP");
const Attendance = require("../models/Attendance");
const RSVPActivity = require("../models/RSVPActivity");


// GET / or GET /events
// Lists all events, supporting optional ?q= (title search), ?sort=, and ?category= filters.
// Also fetches the top 4 trending events (by total RSVP count) across all events for the hero section.
exports.getHomePage = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    const sort = req.query.sort || "date_asc";
    const category = (req.query.category || "").trim();

    const [upcoming, upcomingDocs] = await Promise.all([
      Event.searchUpcoming({ q, sort, category }),
      Event.getUpcomingIds(),
    ]);

    const upcomingEventIds = upcomingDocs.map(e => e._id);
    const trendingEvents = await RSVP.getTopRSVPedEventsByIds(upcomingEventIds, 4);

    res.render("events/index", {
      title: "All Events",
      events: [...upcoming],
      upcoming,
      q, sort, category, CATEGORIES, trendingEvents,
    });
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to load events.");
    res.redirect("/");
  }
};

// GET /events/:id
// Shows the detail page for a single event.
exports.getEventById = async (req, res) => {
  try {
    const event = await Event.getById(req.params.id);
    if (!event) {
      req.flash("error", "Event not found.");
      return res.redirect("/events");
    }
    const userRsvp = req.session.userId
      ? await RSVP.findByUserAndEvent(req.session.userId, req.params.id)
      : null;
    const isFavourited = req.session.userId
      ? !!(await Favourite.findByUserAndEvent(req.session.userId, req.params.id))
      : false;
    const isPast = new Date(event.endDate) < new Date();
    res.render("events/show", { title: event.title, event, userRsvp, isFavourited, isPast });
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to load event.");
    res.redirect("/events");
  }
};

// GET /events/new
// Renders the blank create-event form.
exports.showCreateForm = (req, res) => {
  res.render("events/create", { title: "Create Event", errors: [], formData: {}, categories: CATEGORIES });
};

// POST /events
// Validates and saves a new event, then redirects to its detail page.
exports.createEvent = async (req, res) => {
  const { title, venue, description, category, startDate, endDate, maxParticipants } = req.body;
  const errors = validateEventForm({ title, venue, description, category, startDate, endDate, maxParticipants });

  // Re-render the form with validation errors and preserve the user's input
  if (errors.length > 0) {
    return res.render("events/create", {
      title: "Create Event",
      errors,
      formData: req.body,
      categories: CATEGORIES,
    });
  }

  try {
    const event = await Event.addNewEvent({
      title: title.trim(),
      venue: venue.trim(),
      description: description.trim(),
      category,
      startDate,
      endDate,
      maxParticipants,
      owner: req.session.userId,
    });
    res.redirect(`/events/${event._id}`);
  } catch (err) {
    console.error("createEvent error:", err);
    res.render("events/create", {
      title: "Create Event",
      errors: ["Something went wrong. Please try again."],
      formData: req.body,
      categories: CATEGORIES,
    });
  }
};

// GET /events/:id/edit
// Renders the edit form pre-filled with the current event data.
exports.showEditForm = async (req, res) => {
  try {
    const event = await Event.getById(req.params.id);
    if (!event) {
      req.flash("error", "Event not found.");
      return res.redirect("/events");
    }
    res.render("events/edit", { title: "Edit Event", event, errors: [], categories: CATEGORIES });
  } catch (err) {
    console.error("showEditForm error:", err);
    req.flash("error", "Failed to load event.");
    res.redirect("/events");
  }
};

// POST /events/:id/update
// Validates and saves changes to an existing event, then redirects to its detail page.
exports.updateEvent = async (req, res) => {
  const { title, venue, description, category, startDate, endDate, maxParticipants } = req.body;
  const errors = validateEventForm({ title, venue, description, category, startDate, endDate, maxParticipants });

  // Re-render edit form with errors; reconstruct event object so the form keeps the user's changes
  if (errors.length > 0) {
    return res.render("events/edit", {
      title: "Edit Event",
      errors,
      categories: CATEGORIES,
      event: { _id: req.params.id, ...req.body },
    });
  }

  try {
    const oldEvent = await Event.getById(req.params.id);
    const updatedEvent = await Event.updateEvent(req.params.id, {
      title: title.trim(),
      venue: venue.trim(),
      description: description.trim(),
      category,
      startDate,
      endDate,
      maxParticipants,
    });

    // If capacity was increased, promote waitlisted RSVPs to fill the new slots
    const newMax = parseInt(maxParticipants);
    const oldMax = oldEvent ? oldEvent.maxParticipants : newMax;
    if (newMax > oldMax) {
      const confirmedCount = await RSVP.countConfirmed(req.params.id);
      const slotsAvailable = newMax - confirmedCount;
      for (let i = 0; i < slotsAvailable; i++) {
        const next = await RSVP.findNextWaitlisted(req.params.id);
        if (!next) break;
        await RSVP.promoteToConfirmed(next._id);
      }
    }

    res.redirect(`/events/${req.params.id}`);
  } catch (err) {
    console.error("updateEvent error:", err);
    res.render("events/edit", {
      title: "Edit Event",
      errors: ["Something went wrong. Please try again."],
      categories: CATEGORIES,
      event: { _id: req.params.id, ...req.body },
    });
  }
};

// GET /favourites
// Lists events the logged-in user has saved, with their RSVP status for each.
exports.getMyFavourites = async (req, res) => {
  try {
    const favourites = await Favourite.getAllByUser(req.session.userId);
    const eventIds = favourites.map(f => f.event._id);
    // Fetch RSVPs for all favourited events in one query
    const rsvps = await RSVP.findByUserAndEventIds(req.session.userId, eventIds);
    // Build a lookup map so the view can display RSVP status per event
    const rsvpMap = {};
    rsvps.forEach(r => { rsvpMap[r.event.toString()] = r.status; });
    res.render("events/favourites", { title: "My Favourites", favourites, rsvpMap });
  } catch (err) {
    console.error("getMyFavourites error:", err);
    req.flash("error", "Failed to load favourites.");
    res.redirect("/events");
  }
};

// POST /favourites/:id/notes
// Updates the personal notes field on a favourite record.
exports.updateFavouriteNotes = async (req, res) => {
  try {
    const notes = req.body.notes?.trim() || "";
    
    // Validate notes length (max 500 characters)
    if (notes.length > 500) {
      req.flash("error", "Notes must be 500 characters or less.");
      return res.redirect("/favourites");
    }
    
    // Scoped to the current user to prevent editing another user's favourites
    await Favourite.updateNotes(req.params.id, req.session.userId, notes);
    req.flash("success", "Notes saved.");
    res.redirect("/favourites");
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to save notes.");
    res.redirect("/favourites");
  }
};

// POST /favourites/:id/reminder
// Toggles the reminder flag on a favourite. Returns JSON { reminder: Boolean }.
exports.toggleFavouriteReminder = async (req, res) => {
  try {
    const current = await Favourite.findByIdAndUser(req.params.id, req.session.userId);
    if (!current) return res.status(404).json({ success: false });
    const newReminder = !current.reminder;
    await Favourite.updateReminder(req.params.id, req.session.userId, newReminder);
    return res.json({ success: true, reminder: newReminder });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false });
  }
};

// POST /favourites/:id/tag
// Updates the tag on a favourite. Returns JSON { success, tag }.
exports.updateFavouriteTag = async (req, res) => {
  try {
    const validTags = ["", "social", "educational", "professional"];
    const tag = req.body.tag ?? "";
    if (!validTags.includes(tag)) return res.status(400).json({ success: false, message: "Invalid tag." });
    await Favourite.updateTag(req.params.id, req.session.userId, tag);
    return res.json({ success: true, tag });
  } catch (err) {
    console.error("updateFavouriteTag error:", err);
    return res.status(500).json({ success: false });
  }
};

// POST /favourites/:id/delete
// Removes an event from the user's favourites list.
exports.deleteFavourite = async (req, res) => {
  try {
    // Scoped to the current user to prevent deleting another user's favourites
    await Favourite.removeFavourite(req.params.id, req.session.userId);
    req.flash("success", "Event removed from your favourites.");
    res.redirect("/favourites");
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to remove from favourites.");
    res.redirect("/favourites");
  }
};

// POST /events/:id/favourites/toggle
// Toggles the favourite state for the logged-in user. Returns JSON { isFavourited }.
// When adding, accepts { reminder: Boolean, tag: String } in the JSON body.
exports.toggleFavourite = async (req, res) => {
  try {
    const existing = await Favourite.findByUserAndEvent(req.session.userId, req.params.id);
    if (existing) {
      await Favourite.removeFavourite(existing._id, req.session.userId);
      return res.json({ isFavourited: false });
    } else {
      const { reminder = false, tag = "" } = req.body || {};
      await Favourite.addFavourite(req.session.userId, req.params.id, { reminder, tag });
      return res.json({ isFavourited: true });
    }
  } catch (err) {
    console.error("toggleFavourite error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
};

// POST /events/:id/favourites
// Adds an event to the logged-in user's favourites list. Prevents duplicates.
exports.addToFavourites = async (req, res) => {
  try {
    const alreadySaved = await Favourite.findByUserAndEvent(req.session.userId, req.params.id);

    if (alreadySaved) {
      req.flash("error", "This event is already in your favourites.");
    } else {
      await Favourite.addFavourite(req.session.userId, req.params.id);
      req.flash("success", "Event added to your favourites!");
    }

    res.redirect(`/events/${req.params.id}`);
  } catch (err) {
    console.error(err);
    req.flash("error", "Something went wrong. Please try again.");
    res.redirect(`/events/${req.params.id}`);
  }
};

// POST /events/:id/delete
// Deletes an event (owner-only, enforced by requireEventOwner middleware).
exports.deleteEvent = async (req, res) => {
  try {
    const deletedEvent = await Event.deleteEvent(req.params.id);
    if (!deletedEvent) {
      req.flash("error", "Event not found.");
      return res.redirect("/events");
    }

    // Cascade delete all records associated with this event
    const eventId = req.params.id;
    await Promise.all([
      RSVP.deleteByEvent(eventId),
      Attendance.deleteByEvent(eventId),
      Favourite.deleteByEvent(eventId),
      RSVPActivity.deleteByEvent(eventId),
    ]);

    req.flash("success", "Event deleted successfully.");
    res.redirect("/events");
  } catch (err) {
    console.error(err);
    req.flash("error", "Failed to delete event.");
    res.redirect("/events");
  }
};

// Validates event form fields shared by both create and edit flows.
// Returns an array of error strings; empty array means no errors.
function validateEventForm({ title, venue, description, category, startDate, endDate, maxParticipants }) {
  const errors = [];

  if (!title || title.trim() === "") {
    errors.push("Title is required.");
  } else if (title.trim().length < 3) {
    errors.push("Title must be at least 3 characters.");
  }

  if (!venue || venue.trim() === "") {
    errors.push("Venue is required.");
  }

  if (!description || description.trim() === "") {
    errors.push("Description is required.");
  } else if (description.trim().length < 10) {
    errors.push("Description must be at least 10 characters.");
  }

  if (!category || category.trim() === "") {
    errors.push("Category is required.");
  } else if (!CATEGORIES.includes(category)) {
    errors.push("Invalid category selected.");
  }

  if (!startDate) {
    errors.push("Start date is required.");
  } else {
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (new Date(startDate) < tomorrow) {
      errors.push("Start date must be from tomorrow (00:00H) or later.");
    }
  }

  if (!endDate) {
    errors.push("End date is required.");
  }

  // End date must be strictly after start date
  if (startDate && endDate && new Date(endDate) <= new Date(startDate)) {
    errors.push("End date must be after start date.");
  }

  if (!maxParticipants || isNaN(maxParticipants)) {
    errors.push("Max participants is required and must be a number.");
  } else if (!Number.isInteger(Number(maxParticipants))) {
    errors.push("Max participants must be a whole number.");
  } else if (Number(maxParticipants) < 1) {
    errors.push("Max participants must be at least 1.");
  }

  return errors;
}
