const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    about: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

// Compare a plain password against the stored hash
userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

// Find a single user by exact name or email (case-insensitive)
userSchema.statics.findByIdentifier = function (identifier) {
  const regex = new RegExp(`^${identifier.trim()}$`, "i");
  return this.findOne({ $or: [{ email: regex }, { name: regex }] });
};

// Find user IDs matching a partial name or email search
userSchema.statics.findMatchingIds = async function (query) {
  const regex = new RegExp(query, "i");
  const users = await this.find({ $or: [{ name: regex }, { email: regex }] }).select("_id");
  return users.map((u) => u._id);
};

// Find by exact email
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase().trim() });
};

// Find by email or name (for duplicate checks on signup)
userSchema.statics.findByEmailOrName = function (email, name) {
  return this.findOne({ $or: [{ email: email.toLowerCase().trim() }, { name: name.trim() }] });
};

// Create a new user
userSchema.statics.createUser = function (data) {
  return this.create(data);
};

// Find a user by ID
userSchema.statics.getUserById = function (id) {
  return this.findById(id);
};

// Check if another user already has this email or name (used when editing profile)
userSchema.statics.findByEmailOrNameExcludingId = function (email, name, excludeId) {
  return this.findOne({
    _id: { $ne: excludeId },
    $or: [{ email: email.toLowerCase().trim() }, { name: name.trim() }],
  });
};

// Find by exact phone number (for duplicate check on signup)
userSchema.statics.findByPhone = function (phone) {
  return this.findOne({ phone: phone.trim() });
};

// Check if another user already has this phone number (used when editing profile)
userSchema.statics.findByPhoneExcludingId = function (phone, excludeId) {
  return this.findOne({ _id: { $ne: excludeId }, phone: phone.trim() });
};

// Update profile fields (name, email, phone, about) and return the updated document
userSchema.statics.updateProfile = function (userId, data) {
  return this.findByIdAndUpdate(userId, data, { returnDocument: "after" });
};

// Delete a user by ID
userSchema.statics.deleteById = function (id) {
  return this.findByIdAndDelete(id);
};

module.exports = mongoose.model("User", userSchema);
