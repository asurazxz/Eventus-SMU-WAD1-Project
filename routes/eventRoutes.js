const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware");
const { requireEventOwner } = require("../middleware/ownerMiddleware");
const eventController = require("../controllers/eventController");

// Public routes — no login required
router.get("/", eventController.getHomePage);       // root path alias
router.get("/events", eventController.getHomePage); // canonical events listing

// Protected routes — must be logged in (placed BEFORE /:id to avoid route shadowing)
router.get("/events/new", requireAuth, eventController.showCreateForm);
router.post("/events", requireAuth, eventController.createEvent);

// Owner-only routes — must be logged in AND be the event creator
router.get("/events/:id/edit", requireAuth, requireEventOwner, eventController.showEditForm);
router.post("/events/:id/update", requireAuth, requireEventOwner, eventController.updateEvent);
router.post("/events/:id/delete", requireAuth, requireEventOwner, eventController.deleteEvent);

// Favourites (login required)
router.get("/favourites", requireAuth, eventController.getMyFavourites);
router.post("/favourites/:id/notes", requireAuth, eventController.updateFavouriteNotes);
router.post("/favourites/:id/reminder", requireAuth, eventController.toggleFavouriteReminder);
router.post("/favourites/:id/tag", requireAuth, eventController.updateFavouriteTag);
router.post("/favourites/:id/delete", requireAuth, eventController.deleteFavourite);
router.post("/events/:id/favourites/toggle", requireAuth, eventController.toggleFavourite);
router.post("/events/:id/favourites", requireAuth, eventController.addToFavourites);

// Public event detail — placed last so /events/new and /events/my are matched first
router.get("/events/:id", eventController.getEventById);

module.exports = router;
