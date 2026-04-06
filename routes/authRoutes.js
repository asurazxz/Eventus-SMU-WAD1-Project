const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// Show the sign-up form
router.get("/signup", authController.showSignup);
// Handle sign-up form submission (create account + auto-login)
router.post("/signup", authController.signup);

// Show the login form
router.get("/login", authController.showLogin);
// Handle login form submission (verify credentials + create session)
router.post("/login", authController.login);

// Destroy the session and redirect to login
router.post("/logout", authController.logout);

module.exports = router;
