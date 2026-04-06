const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware");
const { requireEventOwner } = require("../middleware/ownerMiddleware");
const { requireHasEvents } = require("../middleware/requireHasEvents");
const dashboardController = require("../controllers/dashboardController");

// Dashboard views
// Main dashboard overview
router.get("/dashboard", requireAuth, requireHasEvents, dashboardController.getDashboard);
// Todo list sub-page
router.get("/dashboard/todo", requireAuth, requireHasEvents, dashboardController.showTodoList);
// My events sub-page (events the user owns)
router.get("/dashboard/myevents", requireAuth, requireHasEvents, dashboardController.showMyEvents);

// Participants management (event owner only)
// View confirmed and waitlisted participants for a specific event
router.get("/dashboard/events/:id/participants", requireAuth, requireHasEvents, dashboardController.getParticipants);
// Remove a specific RSVP from the participant list
router.post("/dashboard/events/:eventId/participants/:rsvpId/delete", requireAuth, requireEventOwner, dashboardController.deleteRSVP);
// Manually promote a waitlisted RSVP to confirmed
router.post("/dashboard/events/:eventId/participants/:rsvpId/promote", requireAuth, requireEventOwner, dashboardController.promoteRSVP);
// View post-event attendance (check-in status per participant)
router.get("/dashboard/events/:id/attendance", requireAuth, requireHasEvents, dashboardController.getAttendance);
// Export attendance as CSV
router.get("/dashboard/events/:id/attendance/export", requireAuth, requireHasEvents, dashboardController.exportAttendanceCsv);
// Save owner notes for a specific attendee (form POST from attendance page)
router.post("/dashboard/events/:eventId/attendance/:userId/notes", requireAuth, dashboardController.updateAttendanceOwnerNotes);

// Todo CRUD
router.post("/todos/create", requireAuth, dashboardController.createTodo);
router.get("/todos/:todoId/edit", requireAuth, dashboardController.showEditTodoForm);
router.post("/todos/:todoId/update", requireAuth, dashboardController.updateTodo);
// Toggle a todo between pending and completed
router.post("/todos/:todoId/toggle", requireAuth, dashboardController.toggleTodoStatus);
router.post("/todos/:todoId/delete", requireAuth, dashboardController.deleteTodo);

module.exports = router;
