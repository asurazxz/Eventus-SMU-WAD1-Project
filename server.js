require("dotenv").config();

const express = require("express");
const path = require("path");
const session = require("express-session");
const flash = require("connect-flash");
const connectDB = require("./config/db");

const authRoutes = require("./routes/authRoutes");
const eventRoutes = require("./routes/eventRoutes");
const rsvpRoutes = require("./routes/rsvpRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const checkinRoutes = require("./routes/checkinRoutes");
const profileRoutes = require("./routes/profileRoutes");
const { Event } = require("./models/Event");

const app = express();

connectDB();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecretkey",
    resave: false,
    saveUninitialized: false,
    cookie: {
      // Secure cookie in production (HTTPS only)
      secure: process.env.NODE_ENV === "production",
      httpOnly: true, // Prevent XSS attacks
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Flash messages - must be after session
app.use(flash());

// Make flash messages and user context available to all views
app.use(async (req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.info = req.flash("info");
  res.locals.currentUser = req.session.userId || null;
  res.locals.currentUserName = req.session.userName || null;
  if (req.session.userId) {
    try {
      const count = await Event.countDocuments({ owner: req.session.userId });
      res.locals.hasOwnedEvents = count > 0;
    } catch (e) {
      res.locals.hasOwnedEvents = false;
    }
  } else {
    res.locals.hasOwnedEvents = false;
  }
  next();
});

app.get("/index.html", (req, res) => res.redirect("/"));
app.use("/auth", authRoutes);
app.use("/", profileRoutes);
app.use("/", rsvpRoutes);
app.use("/", eventRoutes);
app.use("/", dashboardRoutes);
app.use("/", checkinRoutes);


const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
