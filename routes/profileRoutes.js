const express = require("express");
const router = express.Router();
const { requireAuth } = require("../middleware/authMiddleware");
const profileController = require("../controllers/profileController");

// All routes requires user to be logged in
router.get("/profile", requireAuth, profileController.showProfile);
router.post("/profile/update", requireAuth, profileController.updateProfile);
router.post("/profile/password", requireAuth, profileController.changePassword);
router.post("/profile/delete", requireAuth, profileController.deleteAccount);

module.exports = router;
