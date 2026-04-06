const {Event} = require("../models/Event");
const RSVP = require("../models/RSVP");
const Todo = require("../models/Todo");
const RSVPActivity = require("../models/RSVPActivity.js");
const Attendance = require("../models/Attendance");

function getTimeAgo(date) {
  const diffMs = Date.now() - new Date(date).getTime();

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  return `${days} day${days === 1 ? "" : "s"} ago`;
}

exports.getDashboard = async (req, res) => {
  try {
    const currentUser = req.session.userId;

    // Fetch owner's events (keep for stats)
    const ownerEvents = await Event.getEventsByOwner(currentUser);
    const eventIds = ownerEvents.map((e) => e._id);

    // Exact number of events created by this user
    const totalEvents = await Event.countByOwner(currentUser);
    const today = new Date();
    today.setHours(0,0,0,0);
    const totalUpcomingEvents = await Event.countUpcomingByOwner(currentUser, today);

    // Upcoming event IDs — used for both RSVP stats and top-3 table
    const upcomingEvents = await Event.getUpcomingIdsByOwner(currentUser, today);
    const upcomingIds = upcomingEvents.map(e => e._id);

    // RSVP/waitlist counts scoped to upcoming events only
    const totalRSVPs = await RSVP.countByEventIds(upcomingIds);
    const waitlistCount = await RSVP.countWaitlistByEventIds(upcomingIds);
    const topRaw = await RSVP.getTopRSVPedEventsByIds(upcomingIds, 3);
    const topUpcoming = topRaw.map((item, idx) => ({
      id: item.event?._id || item.eventId,
      title: item.event?.title || "Untitled",
      startDate: item.event?.startDate || null,
      count: item.count || 0
    }));
    
    // Fetch recent RSVPs (from live RSVPs) and recent activity (deleted/cancelled) then merge
    // Fetch a slightly larger window from each source so merging yields the true most-recent items
    const recentLive = await RSVP.getRecentActivityByEventIds(eventIds, 10); // returns RSVPs populated with user/event
    const recentActs = await RSVPActivity.getRecentByEventIds(eventIds, 10); // returns activities populated with user/event

    // Unify both sources into a single timeline
    const unified = [];

    for (let i = 0; i < recentLive.length; i++) {
      const rsvp = recentLive[i];
      const ts = rsvp.updatedAt || rsvp.createdAt || new Date();
      const actionText = rsvp.status === "waitlist" ? "joined the waitlist for" : "RSVPed for";
      unified.push({
        ts,
        userName: rsvp.user?.name || "Deleted User",
        eventTitle: rsvp.event?.title || "Unknown",
        actionText,
      });
    }

    for (let i = 0; i < recentActs.length; i++) {
      const act = recentActs[i];
      const ts = act.createdAt || new Date();
      const actionText = act.action === "deleted" ? "RSVP deleted from" : act.action === "cancelled" ? "cancelled RSVP for" : act.action;
      unified.push({
        ts,
        userName: act.user?.name || "Deleted User",
        eventTitle: act.event?.title || "Unknown",
        actionText,
      });
    }

    // Sort unified timeline by timestamp desc and take top 5
    unified.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
    const top = unified.slice(0, 5);

    // Build recentActivity payload expected by the view
    const recentActivity = [];
    for (let i = 0; i < top.length; i++) {
      const item = top[i];
      recentActivity.push({
        userName: item.userName,
        eventTitle: item.eventTitle,
        actionText: item.actionText,
        timeAgo: getTimeAgo(item.ts),
      });
    }

    res.render("dashboard/index", {
      title: "Owner Dashboard",
      stats: {
        totalEvents,
        totalUpcomingEvents,
        totalRSVPs,
        waitlistCount,
      },
      recentActivity,
      topUpcoming,
    });
  } catch (err) {
    console.error("getDashboard error:", err);
    req.flash("error", "Something went wrong loading the dashboard.");
    res.status(500).redirect("/events");
  }
};

exports.getParticipants = async (req, res) => {
  try {
    const eventId = req.params.id;
    const eventListing = await Event.getById(eventId);

    if (!eventListing) {
      req.flash("error", "Event not found");
      return res.redirect("/dashboard");
    }

    if (!eventListing.owner || eventListing.owner._id.toString() !== req.session.userId) {
      req.flash("error", "You can only view participants for your own events");
      return res.redirect("/dashboard");
    }

    const participants = await RSVP.getParticipantsByEvent(eventListing._id);

    res.render("dashboard/participants", {
      title: "Participants",
      eventListing,
      participants,
    });
  } catch (err) {
    console.error("getParticipants error:", err);
    req.flash("error", "Something went wrong loading participants.");
    res.status(500).redirect("/dashboard");
  }
};

exports.deleteRSVP = async (req, res) => {
  try {
    const { eventId, rsvpId } = req.params;
    const rsvpDoc = await RSVP.getRSVPById(rsvpId);
    if (rsvpDoc) {
      // Verify the RSVP belongs to this event
      if (rsvpDoc.event.toString() !== eventId) {
        req.flash("error", "RSVP does not belong to this event.");
        return res.redirect(`/dashboard/events/${eventId}/participants`);
      }
      await RSVPActivity.createFromRSVP(rsvpDoc, "deleted");
      await RSVP.deleteRSVPById(rsvpId);
      // If a confirmed spot was freed, promote the next waitlisted person
      if (rsvpDoc.status === "confirmed") {
        const nextInLine = await RSVP.findNextWaitlisted(eventId);
        if (nextInLine) await RSVP.promoteToConfirmed(nextInLine._id);
      }
    }
    res.redirect(`/dashboard/events/${eventId}/participants`);
  } catch (err) {
    console.error("deleteRSVP error:", err);
    req.flash("error", "Something went wrong deleting the RSVP.");
    res.status(500).redirect(`/dashboard/events/${req.params.eventId}/participants`);
  }
};

exports.promoteRSVP = async (req, res) => {
  try {
    const { eventId, rsvpId } = req.params;
    const rsvpDoc = await RSVP.getRSVPById(rsvpId);
    if (!rsvpDoc || rsvpDoc.status !== "waitlist") {
      req.flash("error", "RSVP not found or already confirmed.");
      return res.redirect(`/dashboard/events/${eventId}/participants`);
    }
    // Verify the RSVP belongs to this event
    if (rsvpDoc.event.toString() !== eventId) {
      req.flash("error", "RSVP does not belong to this event.");
      return res.redirect(`/dashboard/events/${eventId}/participants`);
    }
    await RSVP.promoteToConfirmed(rsvpId);
    req.flash("success", "Participant promoted to confirmed.");
    res.redirect(`/dashboard/events/${eventId}/participants`);
  } catch (err) {
    console.error("promoteRSVP error:", err);
    req.flash("error", "Something went wrong promoting the RSVP.");
    res.status(500).redirect(`/dashboard/events/${req.params.eventId}/participants`);
  }
};

exports.createTodo = async (req, res) =>{
  try{
    const title = req.body.title;
    const priority = req.body.priority;
    const deadline = req.body.deadline;
    const todoSort = req.body.todoSort || "deadline";

    const validationError = Todo.validateInput({ title, priority, deadline });

    if (validationError) {
      const currentUser = req.session.userId;
      const todos = await Todo.getTodosByUser(currentUser, todoSort);

      return res.render("dashboard/todo", {
        title: "To Do List",
        todos,
        todoSort,
        errors: validationError,
        formData: { title, priority, deadline }
      });
    }

    await Todo.createTodo({
      user: req.session.userId,
      title,
      priority,
      deadline,
      status: "pending"
    });

    res.redirect("/dashboard/todo?todoSort=" + todoSort);

  } catch(err) {
    console.error("createTodo error:", err);
    req.flash("error", "Something went wrong creating the todo.");
    res.status(500).redirect("/dashboard/todo");
  }
}

exports.showEditTodoForm = async (req, res) =>{
  try{
    const todo = await Todo.getTodoById(req.params.todoId);
    if (!todo) {
      req.flash("error", "Todo not found.");
      return res.redirect("/dashboard/todo");
    }
    if (todo.user.toString() !== req.session.userId) {
      req.flash("error", "You can only edit your own todos.");
      return res.redirect("/dashboard/todo");
    }
    res.render("dashboard/editToDo", {
      title: "Edit Todo",
      todo
    });
  } catch (err) {
    console.error("showEditTodoForm error:", err);
    req.flash("error", "Something went wrong loading the edit form.");
    res.status(500).redirect("/dashboard/todo");
  }
}

exports.updateTodo = async (req, res) => {
  try {
    const title = req.body.title;
    const priority = req.body.priority;
    const deadline = req.body.deadline;
    const todoSort = req.query.todoSort || "deadline";

    const todo = await Todo.getTodoById(req.params.todoId);
    if (!todo) {
      req.flash("error", "Todo not found.");
      return res.redirect("/dashboard/todo?todoSort=" + todoSort);
    }
    if (todo.user.toString() !== req.session.userId) {
      req.flash("error", "You can only edit your own todos.");
      return res.redirect("/dashboard/todo?todoSort=" + todoSort);
    }

    const validationError = Todo.validateInput({ title, priority, deadline });

    if (validationError) {
      return res.render("dashboard/editToDo", {
        title: "Edit Todo",
        todo: { ...todo.toObject(), title, priority, deadline },
        errors: validationError,
        todoSort
      });
    }

    await Todo.updateTodoById(req.params.todoId, { title, priority, deadline });
    res.redirect("/dashboard/todo?todoSort=" + todoSort);
  } catch (err) {
    console.error("updateTodo error:", err);
    req.flash("error", "Something went wrong updating the todo.");
    res.status(500).redirect("/dashboard/todo");
  }
};

exports.toggleTodoStatus = async (req, res) => {
  try {
    const todoSort = req.body.todoSort || "deadline";
    const todo = await Todo.getTodoById(req.params.todoId);
    if (!todo) {
      req.flash("error", "Todo not found.");
      return res.redirect("/dashboard/todo?todoSort=" + todoSort);
    }
    if (todo.user.toString() !== req.session.userId) {
      req.flash("error", "You can only update your own todos.");
      return res.redirect("/dashboard/todo?todoSort=" + todoSort);
    }
    const newStatus = todo.status === "completed" ? "pending" : "completed";

    await Todo.updateTodoById(req.params.todoId, { status: newStatus });

    res.redirect("/dashboard/todo?todoSort=" + todoSort);
  } catch (err) {
    console.error("toggleTodoStatus error:", err);
    req.flash("error", "Something went wrong updating the todo status.");
    res.status(500).redirect("/dashboard/todo");
  }
};

exports.deleteTodo = async (req, res) => {
  try {
    const todoSort = req.body.todoSort || "deadline";
    const todo = await Todo.getTodoById(req.params.todoId);
    if (!todo) {
      req.flash("error", "Todo not found.");
      return res.redirect("/dashboard/todo?todoSort=" + todoSort);
    }
    if (todo.user.toString() !== req.session.userId) {
      req.flash("error", "You can only delete your own todos.");
      return res.redirect("/dashboard/todo?todoSort=" + todoSort);
    }
    await Todo.deleteTodoById(req.params.todoId);
    res.redirect("/dashboard/todo?todoSort=" + todoSort);
  } catch (err) {
    console.error("deleteTodo error:", err);
    req.flash("error", "Something went wrong deleting the todo.");
    res.status(500).redirect("/dashboard/todo");
  }
};

// Render To-Do list view
exports.showTodoList = async (req, res) => {
  try {
    const currentUser = req.session.userId;
    const todoSort = req.query.todoSort || "deadline";
    const todos = await Todo.getTodosByUser(currentUser, todoSort);

    res.render("dashboard/todo", {
      title: "To Do List",
      todos,
      todoSort,
    });
  } catch (err) {
    console.error("showTodoList error:", err);
    req.flash("error", "Something went wrong loading the todo list.");
    res.status(500).redirect("/dashboard");
  }
};

// Render My Events view
exports.showMyEvents = async (req, res) => {
  try {
    const today = new Date();
    const currentUser = req.session.userId;

    // Fetch owner's events
    const ownerEvents = await Event.getEventsByOwner(currentUser);
    const eventIds = ownerEvents.map((e) => e._id);

    // Single RSVP query for counts (no aggregate)
    const rsvpsForEvents = await RSVP.findStatusesByEventIds(eventIds);

    const countsById = {};
    for (let i = 0; i < rsvpsForEvents.length; i++) {
      const r = rsvpsForEvents[i];
      const idStr = r.event.toString();
      countsById[idStr] = (countsById[idStr] || 0) + 1;
    }

    // Ongoing events (currently happening)
    const ongoingEventsRaw = await Event.getOngoingEventsByOwner(currentUser, today);
    const upcomingEventsRaw = await Event.getUpcomingEventsByOwner(currentUser, today);
    const pastEventsRaw = await Event.getPastEventsByOwner(currentUser, today);

    const upcomingEvents = upcomingEventsRaw.map((event) => {
      const idStr = event._id.toString();
      return {
        id: event._id,
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        venue: event.venue,
        category: event.category,
        maxParticipants: event.maxParticipants,
        rsvpCount: countsById[idStr] || 0,
      };
    });

    const pastEvents = pastEventsRaw.map((event) => {
      const idStr = event._id.toString();
      return {
        id: event._id,
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        venue: event.venue,
        category: event.category,
        maxParticipants: event.maxParticipants,
        rsvpCount: countsById[idStr] || 0,
      };
    });

    const ongoingEvents = ongoingEventsRaw.map((event) => {
      const idStr = event._id.toString();
      return {
        id: event._id,
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        venue: event.venue,
        category: event.category,
        maxParticipants: event.maxParticipants,
        rsvpCount: countsById[idStr] || 0,
      };
    });

    res.render("dashboard/myevents", {
      title: "My Events",
      ongoingEvents,
      upcomingEvents,
      pastEvents,
    });
  } catch (err) {
    console.error("showMyEvents error:", err);
    req.flash("error", "Something went wrong loading your events.");
    res.status(500).redirect("/dashboard");
  }
};


exports.getAttendance = async (req, res) => {
  try {
    const eventId = req.params.id;
    const eventListing = await Event.getById(eventId);

    if (!eventListing) {
      req.flash("error", "Event not found");
      return res.redirect("/dashboard/myevents");
    }

    if (!eventListing.owner || eventListing.owner._id.toString() !== req.session.userId) {
      req.flash("error", "You can only view attendance for your own events");
      return res.redirect("/dashboard/myevents");
    }

    const participants = await RSVP.getParticipantsByEvent(eventId);
    const attendanceMap = await Attendance.findFullMapForEvent(eventId);

    const attendees = participants.map((rsvp) => {
      const uid = rsvp.user?._id?.toString();
      const attendance = attendanceMap[uid];
      return {
        userId: uid,
        name: rsvp.user?.name || "Deleted User",
        email: rsvp.user?.email || "—",
        rsvpNotes: rsvp.notes || "",
        rsvpStatus: rsvp.status,
        checkedInAt: attendance?.checkedInAt || null,
        ownerNotes: attendance?.ownerNotes || "",
      };
    });

    res.render("dashboard/attendance", {
      title: "Attendance — " + eventListing.title,
      eventListing,
      attendees,
    });
  } catch (err) {
    console.error("getAttendance error:", err);
    req.flash("error", "Something went wrong loading attendance.");
    res.status(500).redirect("/dashboard/myevents");
  }
};

exports.exportAttendanceCsv = async (req, res) => {
  try {
    const eventId = req.params.id;
    const eventListing = await Event.getById(eventId);

    if (!eventListing) return res.status(404).send("Event not found.");

    if (!eventListing.owner || eventListing.owner._id.toString() !== req.session.userId) {
      return res.status(403).send("Forbidden.");
    }

    const participants = await RSVP.getParticipantsByEvent(eventId);
    const checkinMap = await Attendance.findMapForEvent(eventId);

    const rows = [["Name", "Email", "RSVP Status", "Check-In Status", "Check-In Time"]];
    participants.forEach((rsvp) => {
      const uid = rsvp.user?._id?.toString();
      const checkedAt = checkinMap[uid];
      rows.push([
        rsvp.user?.name || "Deleted User",
        rsvp.user?.email || "",
        rsvp.status,
        checkedAt ? "Checked-In" : "Not Checked-In",
        checkedAt ? checkedAt.toISOString() : "",
      ]);
    });

    const csv = rows
      .map((row) => row.map((cell) => '"' + String(cell).replace(/"/g, '""') + '"').join(","))
      .join("\r\n");

    const filename = `attendance-${eventListing.title.replace(/[^a-z0-9]/gi, "-")}-${Date.now()}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="' + filename + '"');
    res.send(csv);
  } catch (err) {
    console.error("exportAttendanceCsv error:", err);
    res.status(500).send("Server error");
  }
};

// POST /dashboard/events/:eventId/attendance/:userId/notes
// Saves the owner's private notes for a specific attendee on the attendance page.
exports.updateAttendanceOwnerNotes = async (req, res) => {
  try {
    const { eventId, userId } = req.params;
    const notes = (req.body.ownerNotes || "").trim().slice(0, 500);

    // Verify event ownership before updating
    const eventListing = await Event.getById(eventId);
    if (!eventListing || !eventListing.owner || eventListing.owner._id.toString() !== req.session.userId) {
      req.flash("error", "Unauthorized.");
      return res.redirect("/dashboard/myevents");
    }

    const updated = await Attendance.updateOwnerNotes(userId, eventId, notes);
    if (!updated) {
      req.flash("error", "No check-in record found for this attendee.");
    } else {
      req.flash("success", "Notes saved.");
    }
    res.redirect(`/dashboard/events/${eventId}/attendance`);
  } catch (err) {
    console.error("updateAttendanceOwnerNotes error:", err);
    req.flash("error", "Failed to save notes.");
    res.redirect(`/dashboard/events/${req.params.eventId}/attendance`);
  }
};
