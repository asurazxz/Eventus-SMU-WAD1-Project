const { Event } = require("../models/Event");

async function requireHasEvents(req, res, next) {
  try {
    const count = await Event.countDocuments({ owner: req.session.userId });
    if (count === 0) {
      return res.render("dashboard/no-events", { title: "Dashboard" });
    }
    next();
  } catch (err) {
    console.error("requireHasEvents error:", err);
    next(err);
  }
}

module.exports = { requireHasEvents };
