
import express from "express";
import mongoose from "mongoose";
import Movie from "../models/Movie.js";
import Counter from "../models/Counter.js";

const router = express.Router();

const GENRES = [
  "Action", "Comedy", "Drama", "Horror",
  "Sci-Fi", "Romance", "Thriller"
];

const PLATFORMS = [
  "Netflix", "Prime Video", "Hotstar", "Theatre", "Other"
];

const STATUSES = ["To Watch", "Watching", "Watched"];
const CURRENT_YEAR = new Date().getFullYear();

// Consistent response format
const respond = (res, status, success, message, data = null) =>
  res.status(status).json({ success, message, data });

const validId = (id) => mongoose.isValidObjectId(id);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateMovie(body, creating = false) {
  if (creating) {
    const year = Number(body.releaseYear);

    if (
      body.releaseYear === undefined ||
      !Number.isInteger(year) ||
      year < 1950 ||
      year > CURRENT_YEAR
    ) {
      return `Release year must be between 1950 and ${CURRENT_YEAR}.`;
    }
  }

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || !body.title.trim()) {
      return "Title is required.";
    }
    if (body.title.trim().length > 200) {
      return "Title cannot exceed 200 characters.";
    }
  }

  if (body.genre !== undefined && !GENRES.includes(body.genre)) {
    return "Invalid genre.";
  }

  if (body.platform !== undefined && !PLATFORMS.includes(body.platform)) {
    return "Invalid platform.";
  }

  if (body.runtime !== undefined) {
    const runtime = Number(body.runtime);
    if (!Number.isInteger(runtime) || runtime < 30 || runtime > 300) {
      return "Runtime must be between 30 and 300 minutes.";
    }
  }

  if (body.priority !== undefined) {
    const priority = Number(body.priority);
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
      return "Priority must be an integer from 1 to 5.";
    }
  }

  if (creating) {
    for (const field of [
      "title", "genre", "runtime", "platform", "priority"
    ]) {
      if (
        body[field] === undefined ||
        body[field] === null ||
        body[field] === ""
      ) {
        return `${field} is required.`;
      }
    }
  }

  return null;
}

function handleError(res, error) {
  if (error.code === 11000) {
    return respond(
      res, 409, false,
      "A movie with this title and release year already exists."
    );
  }

  if (error.name === "ValidationError" || error.name === "CastError") {
    return respond(res, 400, false, error.message);
  }

  console.error(error);
  return respond(res, 500, false, "An internal server error occurred.");
}

// Generate a separate sequential code for each release year.
// Counter.findOneAndUpdate uses an atomic MongoDB operation.
async function generateMovieCode(year) {
  const counter = await Counter.findOneAndUpdate(
    { _id: String(year) },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return `MV-${year}-${String(counter.sequence).padStart(3, "0")}`;
}

// GET /api/movies/stats
// Dashboard statistics
router.get("/stats", async (req, res) => {
  try {
    const [statusResults, watchedResults] = await Promise.all([
      Movie.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      Movie.aggregate([
        { $match: { status: "Watched" } },
        {
          $group: {
            _id: null,
            totalRuntime: { $sum: "$runtime" },
            averageRating: { $avg: "$rating" },
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const counts = {
      "To Watch": 0,
      "Watching": 0,
      "Watched": 0
    };

    statusResults.forEach((item) => {
      counts[item._id] = item.count;
    });

    const watched = watchedResults[0] || {
      totalRuntime: 0,
      averageRating: null,
      count: 0
    };

    const genreResults = await Movie.aggregate([
      { $match: { status: "Watched" } },
      { $group: { _id: "$genre", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 1 }
    ]);

    return respond(res, 200, true, "Statistics retrieved.", {
      counts,
      totalHoursWatched: Math.round(
        (watched.totalRuntime / 60) * 10
      ) / 10,
      averageRating: watched.averageRating == null
        ? 0
        : Math.round(watched.averageRating * 10) / 10,
      topWatchedGenre: genreResults[0]?._id || null
    });
  } catch (error) {
    return handleError(res, error);
  }
});

// GET /api/movies/watch-next
router.get("/watch-next", async (req, res) => {
  try {
    const movie = await Movie.findOne({ status: "To Watch" })
      .sort({ priority: -1, runtime: 1, createdAt: 1 });

    if (!movie) {
      return respond(
        res, 404, false,
        "No movies are currently waiting to be watched."
      );
    }

    return respond(res, 200, true, "Here is your next movie.", movie);
  } catch (error) {
    return handleError(res, error);
  }
});

// GET /api/movies?status=To%20Watch&genre=Action&search=batman&page=1
// Filtering, searching, pagination
router.get("/", async (req, res) => {
  try {
    const { status, genre, search = "" } = req.query;
    const page = Number(req.query.page ?? 1);

    if (!Number.isInteger(page) || page < 1) {
      return respond(res, 400, false, "Page must be a positive integer.");
    }

    if (status && !STATUSES.includes(status)) {
      return respond(res, 400, false, "Invalid status filter.");
    }

    if (genre && !GENRES.includes(genre)) {
      return respond(res, 400, false, "Invalid genre filter.");
    }

    const filter = {};

    if (status) filter.status = status;
    if (genre) filter.genre = genre;

    if (typeof search !== "string") {
      return respond(res, 400, false, "Search must be text.");
    }

    if (search.trim()) {
      filter.title = {
        $regex: escapeRegex(search.trim()),
        $options: "i"
      };
    }

    const totalMovies = await Movie.countDocuments(filter);
    const totalPages = Math.ceil(totalMovies / 6);

    // To Watch comes first; its movies are ordered by priority.
    const movies = await Movie.find(filter)
      .sort({ status: 1, priority: -1, runtime: 1, createdAt: -1 })
      .skip((page - 1) * 6)
      .limit(6);

    return respond(res, 200, true, "Movies retrieved.", {
      movies,
      currentPage: page,
      totalPages,
      totalMovies
    });
  } catch (error) {
    return handleError(res, error);
  }
});

// POST /api/movies
router.post("/", async (req, res) => {
  try {
    const error = validateMovie(req.body, true);
    if (error) return respond(res, 400, false, error);

    const title = req.body.title.trim();
    const releaseYear = Number(req.body.releaseYear);

    // Never accept client-generated codes or statuses.
    const duplicate = await Movie.findOne({
      title,
      releaseYear
    }).collation({ locale: "en", strength: 2 });

    if (duplicate) {
      return respond(
        res, 409, false,
        "A movie with this title and release year already exists."
      );
    }

    const movieCode = await generateMovieCode(releaseYear);

    const movie = await Movie.create({
      movieCode,
      title,
      genre: req.body.genre,
      releaseYear,
      runtime: Number(req.body.runtime),
      platform: req.body.platform,
      priority: Number(req.body.priority),
      status: "To Watch",
      rating: null,
      watchedDate: null
    });

    return respond(res, 201, true, "Movie added successfully.", movie);
  } catch (error) {
    return handleError(res, error);
  }
});

// GET /api/movies/:id
router.get("/:id", async (req, res) => {
  if (!validId(req.params.id)) {
    return respond(res, 400, false, "Invalid movie ID.");
  }

  try {
    const movie = await Movie.findById(req.params.id);

    if (!movie) return respond(res, 404, false, "Movie not found.");

    return respond(res, 200, true, "Movie retrieved.", movie);
  } catch (error) {
    return handleError(res, error);
  }
});

// PUT /api/movies/:id
// Only editable fields are accepted. Release year and code cannot change.
router.put("/:id", async (req, res) => {
  if (!validId(req.params.id)) {
    return respond(res, 400, false, "Invalid movie ID.");
  }

  try {
    const movie = await Movie.findById(req.params.id);

    if (!movie) return respond(res, 404, false, "Movie not found.");

    const editableFields = [
      "title", "genre", "runtime", "platform", "priority"
    ];

    const updates = {};

    for (const field of editableFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return respond(res, 400, false, "No editable fields provided.");
    }

    const error = validateMovie(updates);
    if (error) return respond(res, 400, false, error);

    if (updates.title !== undefined) {
      updates.title = updates.title.trim();
    }
    if (updates.runtime !== undefined) {
      updates.runtime = Number(updates.runtime);
    }
    if (updates.priority !== undefined) {
      updates.priority = Number(updates.priority);
    }

    const nextTitle = updates.title ?? movie.title;

    const duplicate = await Movie.findOne({
      _id: { $ne: movie._id },
      title: nextTitle,
      releaseYear: movie.releaseYear
    }).collation({ locale: "en", strength: 2 });

    if (duplicate) {
      return respond(
        res, 409, false,
        "Another movie with this title and release year already exists."
      );
    }

    Object.assign(movie, updates);
    await movie.save();

    return respond(res, 200, true, "Movie updated successfully.", movie);
  } catch (error) {
    return handleError(res, error);
  }
});

// PATCH /api/movies/:id/status
router.patch("/:id/status", async (req, res) => {
  if (!validId(req.params.id)) {
    return respond(res, 400, false, "Invalid movie ID.");
  }

  try {
    const movie = await Movie.findById(req.params.id);

    if (!movie) return respond(res, 404, false, "Movie not found.");

    const nextStatus = req.body.status;

    if (!STATUSES.includes(nextStatus)) {
      return respond(res, 400, false, "Invalid status.");
    }

    if (movie.status === "Watched") {
      return respond(res, 400, false, "Watched is a final status.");
    }

    const transitions = {
      "To Watch": ["Watching", "Watched"],
      "Watching": ["Watched", "To Watch"],
      "Watched": []
    };

    if (!transitions[movie.status].includes(nextStatus)) {
      return respond(res, 400, false, "Invalid status transition.");
    }

    if (nextStatus === "Watched") {
      const rating = req.body.rating;

      if (
        rating === undefined ||
        !Number.isInteger(Number(rating)) ||
        Number(rating) < 1 ||
        Number(rating) > 10
      ) {
        return respond(
          res, 400, false,
          "A rating from 1 to 10 is required to mark a movie as Watched."
        );
      }

      movie.rating = Number(rating);
      movie.watchedDate = new Date();
    } else {
      // Ratings are only permitted for Watched movies.
      movie.rating = null;
      movie.watchedDate = null;
    }

    movie.status = nextStatus;
    await movie.save();

    return respond(res, 200, true, "Movie status updated.", movie);
  } catch (error) {
    return handleError(res, error);
  }
});

// PATCH /api/movies/:id/rating
// Edit rating only for an already Watched movie.
router.patch("/:id/rating", async (req, res) => {
  if (!validId(req.params.id)) {
    return respond(res, 400, false, "Invalid movie ID.");
  }

  const rating = req.body.rating;

  if (
    rating === undefined ||
    !Number.isInteger(Number(rating)) ||
    Number(rating) < 1 ||
    Number(rating) > 10
  ) {
    return respond(res, 400, false, "Rating must be an integer from 1 to 10.");
  }

  try {
    const movie = await Movie.findById(req.params.id);

    if (!movie) return respond(res, 404, false, "Movie not found.");

    if (movie.status !== "Watched") {
      return respond(res, 400, false, "Only Watched movies can be rated.");
    }

    movie.rating = Number(rating);
    await movie.save();

    return respond(res, 200, true, "Rating updated.", movie);
  } catch (error) {
    return handleError(res, error);
  }
});

// DELETE /api/movies/:id
router.delete("/:id", async (req, res) => {
  if (!validId(req.params.id)) {
    return respond(res, 400, false, "Invalid movie ID.");
  }

  try {
    const movie = await Movie.findById(req.params.id);

    if (!movie) return respond(res, 404, false, "Movie not found.");

    if (movie.status === "Watching") {
      return respond(
        res, 400, false,
        "Movies in Watching status cannot be deleted."
      );
    }

    await movie.deleteOne();

    return respond(res, 200, true, "Movie deleted successfully.", movie);
  } catch (error) {
    return handleError(res, error);
  }
});

export default router;
