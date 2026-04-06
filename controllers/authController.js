const { body, validationResult } = require("express-validator");
const User = require("../models/User");
const Favourite = require("../models/Favourite");

// Validation rules for signup
const signupValidation = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Username is required")
    .isLength({ min: 2, max: 50 })
    .withMessage("Username must be between 2 and 50 characters"),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please enter a valid email")
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/\d/)
    .withMessage("Password must contain at least one number"),

  body("phone")
    .trim()
    .notEmpty()
    .withMessage("Phone number is required")
    .matches(/^\d{8}$/)
    .withMessage("Phone number must be exactly 8 digits"),
];

// Show signup form
exports.showSignup = (req, res) => {
  // If already logged in, redirect to events
  if (req.session.userId) {
    return res.redirect("/events");
  }
  res.render("auth/signup", { 
    title: "Sign Up",
    errors: [],
    oldInput: {}
  });
};

// Handle signup
exports.signup = [
  signupValidation,
  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);

    // Handle error invalid sign up
    if (!errors.isEmpty()) {
      // Keep old input to repopulate form
      const oldInput = {
        name: req.body.name,
        email: req.body.email,
        phone: req.body.phone,
      };

      return res.status(400).render("auth/signup", {
        title: "Sign Up",
        errors: errors.array(),
        oldInput,
      });
    }

    try {
      // Check if user already exists (email or name)
      const existingUser = await User.findByEmailOrName(req.body.email, req.body.name);

      if (existingUser) {
        // Determine which field caused the duplicate
        if (existingUser.email === req.body.email) {
          return res.status(400).render("auth/signup", {
            title: "Sign Up",
            errors: [{ msg: "Email already registered" }],
            oldInput: { name: req.body.name, email: req.body.email, phone: req.body.phone },
          });
        } else {
          return res.status(400).render("auth/signup", {
            title: "Sign Up",
            errors: [{ msg: "Username already taken" }],
            oldInput: { name: req.body.name, email: req.body.email, phone: req.body.phone },
          });
        }
      }

      // Check if phone number is already in use
      const existingPhone = await User.findByPhone(req.body.phone);
      if (existingPhone) {
        return res.status(400).render("auth/signup", {
          title: "Sign Up",
          errors: [{ msg: "Phone number already registered" }],
          oldInput: { name: req.body.name, email: req.body.email, phone: req.body.phone },
        });
      }

      // Create new user
      const user = await User.createUser({
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        phone: req.body.phone,
      });

      // Set session to store user ID and name
      req.session.userId = user._id;
      req.session.userName = user.name;

      // Flash success message and redirect
      req.flash("success", "Account created successfully! Welcome aboard.");
      const returnTo = req.session.returnTo || "/events";
      delete req.session.returnTo;
      res.redirect(returnTo);

    } catch (error) {
      console.error("Signup error:", error);
      
      // Handle duplicate key error (last-resort fallback for race conditions)
      if (error.code === 11000) {
        const field = Object.keys(error.keyValue)[0];
        const msgMap = {
          email: "Email already registered",
          name: "Username already taken",
          phone: "Phone number already registered",
        };
        const msg = msgMap[field] || "An account with that information already exists";

        return res.status(400).render("auth/signup", {
          title: "Sign Up",
          errors: [{ msg }],
          oldInput: { name: req.body.name, email: req.body.email, phone: req.body.phone },
        });
      }

      // Generic error
      req.flash("error", "Something went wrong. Please try again.");
      res.redirect("/auth/signup");
    }
  },
];

// Show login form
exports.showLogin = (req, res) => {
  // If already logged in, redirect to events
  if (req.session.userId) {
    return res.redirect("/events");
  }
  // Capture returnTo from query param (e.g. from "Login to RSVP" links)
  if (req.query.returnTo && req.query.returnTo.startsWith("/")) {
    req.session.returnTo = req.query.returnTo;
  }
  res.render("auth/login", {
    title: "Login",
    errors: []
  });
};

// Handle login
exports.login = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please enter a valid email")
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Password is required"),

  async (req, res) => {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).render("auth/login", {
        title: "Login",
        errors: errors.array(),
      });
    }

    try {
      // Find user by email
      const user = await User.findByEmail(req.body.email);

      if (!user) {
        // Don't reveal if email exists or not for security purposes
        return res.status(401).render("auth/login", {
          title: "Login",
          errors: [{ msg: "Invalid email or password" }],
        });
      }

      // Compare password with stored hash
      const isMatch = await user.comparePassword(req.body.password);

      if (!isMatch) {
        return res.status(401).render("auth/login", {
          title: "Login",
          errors: [{ msg: "Invalid email or password" }],
        });
      }

      // Password matches - create session
      req.session.userId = user._id;
      req.session.userName = user.name;

      // Handle "Remember Me" - extend session to 7 days
      if (req.body.rememberMe === "true") {
        req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      } else {
        req.session.cookie.maxAge = 24 * 60 * 60 * 1000; // 24 hours
      }

      // Flash success and redirect back to where they came from
      req.flash("success", `Welcome back, ${user.name}!`);

      // Check for events the user has favourited with a reminder that start tomorrow
      try {
        const tomorrowStart = new Date();
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        tomorrowStart.setHours(0, 0, 0, 0);
        const tomorrowEnd = new Date(tomorrowStart);
        tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

        const reminders = await Favourite.getUpcomingReminders(user._id, tomorrowStart, tomorrowEnd);
        reminders.forEach((fav) => {
          req.flash("info", `Reminder: "${fav.event.title}" is happening tomorrow!`);
        });
      } catch (reminderErr) {
        console.error("Reminder check failed:", reminderErr);
      }

      const returnTo = req.session.returnTo || "/events";
      delete req.session.returnTo;
      res.redirect(returnTo);
    } catch (error) {
      console.error("Login error:", error);
      req.flash("error", "Something went wrong. Please try again.");
      res.redirect("/auth/login");
    }
  },
];

// Handle logout
exports.logout = (req, res) => {
  // Clear the session
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.redirect("/");
    }
    
    // Redirect without flash message (session is destroyed)
    res.redirect("/");
  });
};