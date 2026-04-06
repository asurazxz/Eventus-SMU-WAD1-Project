const {Event} = require("../models/Event");

// Works for routes that use either :id or :eventId as the event param name.
async function requireEventOwner(req, res, next) {
  try {
    const event = await Event.findById(req.params.id || req.params.eventId);

    if (!event) {
      req.flash("error", "Event not found");
      return res.redirect("/events");
    }

    // Check if the logged-in user is the event owner
    if (!event.owner || event.owner.toString() !== req.session.userId) {
      req.flash("error", "You can only edit or delete your own events");
      return res.redirect("/events");
    }

    next();
  } catch (error) {
    console.error("Owner check error:", error);
    req.flash("error", "Something went wrong");
    res.redirect("/events");
  }
}

module.exports = { requireEventOwner };