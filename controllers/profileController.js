const User = require("../models/User");
const { Event } = require("../models/Event");
const RSVP = require("../models/RSVP");
const Attendance = require("../models/Attendance");
const Favourite = require("../models/Favourite");
const Todo = require("../models/Todo");
const RSVPActivity = require("../models/RSVPActivity");

// GET /profile
// Renders the logged-in user's profile page.
exports.showProfile = async (req, res) => {
  try {
    const user = await User.getUserById(req.session.userId);
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/events");
    }
    res.render("profile/show", {
      title: "My Profile",
      user,
      profileErrors: [],
      profileFormData: null,
    });
  } catch (err) {
    console.error("showProfile error:", err);
    req.flash("error", "Failed to load profile.");
    res.redirect("/events");
  }
};

// POST /profile/update
// Validates and saves changes to name, email, phone, and about.
exports.updateProfile = async (req, res) => {
  const { name, email, phone, about } = req.body;
  const userId = req.session.userId;

  const errors = validateProfileForm({ name, email, phone, about });

  if (errors.length > 0) {
    const user = await User.getUserById(userId);
    return res.render("profile/show", {
      title: "My Profile",
      user,
      profileErrors: errors,
      profileFormData: { name, email, phone, about },
    });
  }

  try {
    // Check if another user already has this email or name
    const conflict = await User.findByEmailOrNameExcludingId(email, name, userId);
    if (conflict) {
      const user = await User.getUserById(userId);
      const msg = conflict.email === email.toLowerCase().trim()
        ? "That email is already in use by another account."
        : "That username is already taken.";
      return res.render("profile/show", {
        title: "My Profile",
        user,
        profileErrors: [msg],
        profileFormData: { name, email, phone, about },
      });
    }

    // Check if another user already has this phone number
    const phoneConflict = await User.findByPhoneExcludingId(phone, userId);
    if (phoneConflict) {
      const user = await User.getUserById(userId);
      return res.render("profile/show", {
        title: "My Profile",
        user,
        profileErrors: ["That phone number is already in use by another account."],
        profileFormData: { name, email, phone, about },
      });
    }

    const updated = await User.updateProfile(userId, {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      about: about ? about.trim() : "",
    });

    // Keep session name in sync if it changed
    req.session.userName = updated.name;

    req.flash("success", "Profile updated successfully.");
    res.redirect("/profile");
  } catch (err) {
    console.error("updateProfile error:", err);
    req.flash("error", "Failed to update profile. Please try again.");
    res.redirect("/profile");
  }
};

// POST /profile/password
// Verifies old password then updates to the new password.
exports.changePassword = async (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;
  const userId = req.session.userId;

  try {
    const user = await User.getUserById(userId);
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/profile");
    }

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      req.flash("error", "Current password is incorrect.");
      return res.redirect("/profile");
    }

    if (!newPassword || newPassword.length < 8) {
      req.flash("error", "New password must be at least 8 characters.");
      return res.redirect("/profile");
    }
    if (!/\d/.test(newPassword)) {
      req.flash("error", "New password must contain at least one number.");
      return res.redirect("/profile");
    }
    if (newPassword !== confirmPassword) {
      req.flash("error", "New passwords do not match.");
      return res.redirect("/profile");
    }

    // Assign and save to trigger the pre-save hash hook
    user.password = newPassword;
    await user.save();

    req.flash("success", "Password changed successfully.");
    res.redirect("/profile");
  } catch (err) {
    console.error("changePassword error:", err);
    req.flash("error", "Failed to change password. Please try again.");
    res.redirect("/profile");
  }
};

// POST /profile/delete
/* Verifies password, then performs a full cascade delete of the user's account:
   - Upcoming owned events -> hard-deleted (+ their RSVPs, Attendance, Favourites, RSVPActivity)
   - Past/ended owned events -> owner set to null (anonymized; records preserved)
   - User's RSVPs to upcoming events they attend -> deleted + waitlist auto-promoted
   - User's RSVPs/Attendance to past events -> kept (owners can still see "Deleted User")
   - User's Favourites, Todos, RSVPActivity -> deleted
   - User document -> deleted; session destroyed
*/
exports.deleteAccount = async (req, res) => {
  const { password } = req.body;
  const userId = req.session.userId;

  try {
    const user = await User.getUserById(userId);
    if (!user) {
      req.flash("error", "User not found.");
      return res.redirect("/profile");
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      req.flash("error", "Incorrect password. Account not deleted.");
      return res.redirect("/profile");
    }

    const now = new Date();

    // Hard-delete upcoming/ongoing owned events and their child records
    const notEndedEvents = await Event.findNotEndedByOwner(userId, now);
    for (const event of notEndedEvents) {
      const eventId = event._id;
      await Promise.all([
        RSVP.deleteByEvent(eventId),
        Attendance.deleteByEvent(eventId),
        Favourite.deleteByEvent(eventId),
        RSVPActivity.deleteByEvent(eventId),
      ]);
      await Event.deleteEvent(eventId);
    }

    // Anonymize past owned events (set owner to null so history is preserved)
    await Event.anonymizeOwner(userId);

    // Cancel user's RSVPs to upcoming events they're attending (not owning).
    // Waitlist auto-promotes when a confirmed spot is freed.
    const allUserRsvps = await RSVP.findAllByUserWithEvent(userId);
    const upcomingRsvps = allUserRsvps.filter(
      (r) => r.event && new Date(r.event.endDate) > now
    );
    for (const rsvp of upcomingRsvps) {
      if (rsvp.status === "confirmed") {
        const next = await RSVP.findNextWaitlisted(rsvp.event._id);
        if (next) await RSVP.promoteToConfirmed(next._id);
      }
      await RSVP.deleteRSVPById(rsvp._id);
    }

    // Delete remaining user-owned data
    await Promise.all([
      Favourite.deleteByUser(userId),
      Todo.deleteByUser(userId),
      RSVPActivity.deleteByUser(userId),
    ]);

    // Delete the user document
    await User.deleteById(userId);

    // Destroy session and redirect
    req.session.destroy(() => {
      res.redirect("/events");
    });
  } catch (err) {
    console.error("deleteAccount error:", err);
    req.flash("error", "Something went wrong. Please try again.");
    res.redirect("/profile");
  }
};

// Input valiation
function validateProfileForm({ name, email, phone, about }) {
  const errors = [];

  if (!name || name.trim().length < 2) {
    errors.push("Username must be at least 2 characters.");
  } else if (name.trim().length > 50) {
    errors.push("Username must be 50 characters or less.");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email.trim())) {
    errors.push("A valid email address is required.");
  }

  if (!phone || !/^\d{8}$/.test(phone.trim())) {
    errors.push("Phone number must be exactly 8 digits.");
  }

  if (about && about.trim().length > 300) {
    errors.push("About must be 300 characters or less.");
  }

  return errors;
}
