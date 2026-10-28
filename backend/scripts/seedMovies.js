import dotenv from "dotenv";
import mongoose from "mongoose";
import Movie from "../models/Movie.js";
import Counter from "../models/Counter.js";

dotenv.config();

const sampleMovies = [
  {
    title: "Mad Max: Fury Road",
    genre: "Action",
    releaseYear: 2015,
    runtime: 120,
    platform: "Prime Video",
    priority: 5,
    status: "To Watch",
  },
  {
    title: "Arrival",
    genre: "Sci-Fi",
    releaseYear: 2016,
    runtime: 116,
    platform: "Netflix",
    priority: 4,
    status: "Watching",
  },
  {
    title: "The Grand Budapest Hotel",
    genre: "Comedy",
    releaseYear: 2014,
    runtime: 99,
    platform: "Other",
    priority: 3,
    status: "Watched",
    rating: 9,
    watchedDate: "2026-03-17",
  },
  {
    title: "Parasite",
    genre: "Thriller",
    releaseYear: 2019,
    runtime: 132,
    platform: "Prime Video",
    priority: 5,
    status: "Watched",
    rating: 10,
    watchedDate: "2026-05-04",
  },
  {
    title: "La La Land",
    genre: "Romance",
    releaseYear: 2016,
    runtime: 128,
    platform: "Netflix",
    priority: 2,
    status: "To Watch",
  },
  {
    title: "Get Out",
    genre: "Horror",
    releaseYear: 2017,
    runtime: 104,
    platform: "Hotstar",
    priority: 4,
    status: "Watching",
  },
  {
    title: "The Shawshank Redemption",
    genre: "Drama",
    releaseYear: 1994,
    runtime: 142,
    platform: "Other",
    priority: 4,
    status: "Watched",
    rating: 9,
    watchedDate: "2026-01-29",
  },
  {
    title: "John Wick",
    genre: "Action",
    releaseYear: 2014,
    runtime: 101,
    platform: "Theatre",
    priority: 3,
    status: "To Watch",
  },
  {
    title: "Blade Runner 2049",
    genre: "Sci-Fi",
    releaseYear: 2017,
    runtime: 164,
    platform: "Netflix",
    priority: 5,
    status: "Watching",
  },
  {
    title: "Before Sunrise",
    genre: "Romance",
    releaseYear: 1995,
    runtime: 101,
    platform: "Prime Video",
    priority: 2,
    status: "To Watch",
  },
];

async function generateMovieCode(year) {
  const counter = await Counter.findOneAndUpdate(
    { _id: String(year) },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return `MV-${year}-${String(counter.sequence).padStart(3, "0")}`;
}

function assertNoSeedDuplicates(movies) {
  const seen = new Set();

  for (const movie of movies) {
    const key = `${movie.title.trim().toLowerCase()}::${movie.releaseYear}`;
    if (seen.has(key)) {
      throw new Error(
        `Seed data contains a duplicate title/releaseYear pair: ${movie.title} (${movie.releaseYear}).`
      );
    }
    seen.add(key);
  }
}

function buildMoviePayload(movie, movieCode) {
  const isWatched = movie.status === "Watched";

  return {
    movieCode,
    title: movie.title.trim(),
    genre: movie.genre,
    releaseYear: movie.releaseYear,
    runtime: movie.runtime,
    platform: movie.platform,
    priority: movie.priority,
    status: movie.status,
    rating: isWatched ? movie.rating : null,
    watchedDate: isWatched ? new Date(movie.watchedDate) : null,
  };
}

async function seedMovies() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing from backend/.env");
  }

  assertNoSeedDuplicates(sampleMovies);

  let inserted = 0;
  let skipped = 0;

  await mongoose.connect(process.env.MONGO_URI);

  try {
    for (const movie of sampleMovies) {
      const title = movie.title.trim();

      const existing = await Movie.findOne({
        title,
        releaseYear: movie.releaseYear,
      }).collation({ locale: "en", strength: 2 });

      if (existing) {
        skipped += 1;
        continue;
      }

      const movieCode = await generateMovieCode(movie.releaseYear);
      const payload = buildMoviePayload(movie, movieCode);

      await Movie.create(payload);
      inserted += 1;
    }

    const totalMovies = await Movie.countDocuments();

    console.log("Seed complete.");
    console.log(`Inserted: ${inserted}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Total movies: ${totalMovies}`);
  } finally {
    await mongoose.connection.close();
  }
}

seedMovies()
  .catch((error) => {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  });
