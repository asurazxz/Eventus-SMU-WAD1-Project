const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5 seconds
      socketTimeoutMS: 45000, // Socket timeout
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
    console.log(`Database: ${conn.connection.name}`);
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    console.error("\nTroubleshooting tips:");
    console.error("1. Check if your IP address is whitelisted on MongoDB Atlas");
    console.error("2. Verify username and password in MONGO_URI");
    console.error("3. Ensure MongoDB Atlas cluster is running");
    console.error("4. Check your internet connection\n");
    process.exit(1);
  }
};

module.exports = connectDB;