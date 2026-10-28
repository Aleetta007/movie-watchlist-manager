
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import movieRoutes from "./routes/movieRoutes.js";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Movie API routes
app.use("/api/movies", movieRoutes);

// Root route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Movie Watchlist API is running",
    data: null,
  });
});

// Health-check route
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API is healthy",
    data: {
      database:
        mongoose.connection.readyState === 1
          ? "connected"
          : "disconnected",
    },
  });
});

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
    data: null,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    data: null,
  });
});

// Connect to MongoDB Atlas, then start server
const PORT = process.env.PORT || 5000;

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is missing from backend/.env");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Atlas connected!");

    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });
