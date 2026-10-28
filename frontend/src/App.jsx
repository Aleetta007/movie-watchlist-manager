
import { useCallback, useEffect, useState } from "react";
import "./App.css";

const API = "http://localhost:5000/api/movies";

const GENRES = [
  "Action", "Comedy", "Drama", "Horror",
  "Sci-Fi", "Romance", "Thriller",
];

const PLATFORMS = [
  "Netflix", "Prime Video", "Hotstar", "Theatre", "Other",
];

const EMPTY_FORM = {
  title: "",
  genre: "Action",
  releaseYear: new Date().getFullYear(),
  runtime: 120,
  platform: "Netflix",
  priority: 3,
};

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || "Request failed.");
  }

  return result.data;
}

export default function App() {
  const [movies, setMovies] = useState([]);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [ratingMovie, setRatingMovie] = useState(null);
  const [rating, setRating] = useState(8);
  const [watchNext, setWatchNext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadMovies = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (statusFilter) params.set("status", statusFilter);
      if (genreFilter) params.set("genre", genreFilter);
      if (search.trim()) params.set("search", search.trim());

      const data = await request(`${API}?${params}`);
      setMovies(data.movies);
      setTotalPages(data.totalPages);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, genreFilter, search]);

  const loadStats = useCallback(async () => {
    try {
      setStats(await request(`${API}/stats`));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([loadMovies(), loadStats()]);
  }, [loadMovies, loadStats]);

  useEffect(() => {
    loadMovies();
  }, [loadMovies]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  function updateField(event) {
    setForm((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
    }));
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
    setError("");
    setNotice("");
  }

  function openEdit(movie) {
    setForm({
      title: movie.title,
      genre: movie.genre,
      runtime: movie.runtime,
      platform: movie.platform,
      priority: movie.priority,
    });
    setEditingId(movie._id);
    setShowForm(true);
    setError("");
    setNotice("");
  }

  async function saveMovie(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    const year = Number(form.releaseYear);
    const runtime = Number(form.runtime);
    const priority = Number(form.priority);

    if (!editingId && (!Number.isInteger(year) ||
        year < 1950 || year > new Date().getFullYear())) {
      setError("Release year must be between 1950 and the current year.");
      return;
    }

    if (!Number.isInteger(runtime) || runtime < 30 || runtime > 300) {
      setError("Runtime must be between 30 and 300 minutes.");
      return;
    }

    if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
      setError("Priority must be between 1 and 5.");
      return;
    }

    try {
      const payload = {
        title: form.title.trim(),
        genre: form.genre,
        runtime,
        platform: form.platform,
        priority,
      };

      if (editingId) {
        await request(`${API}/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await request(API, {
          method: "POST",
          body: JSON.stringify({ ...payload, releaseYear: year }),
        });
      }

      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      setNotice(editingId ? "Movie updated successfully." : "Movie added successfully.");
      setPage(1);
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function changeStatus(movie, nextStatus) {
    if (!nextStatus || nextStatus === movie.status) return;

    setError("");
    setNotice("");

    try {
      let payload = { status: nextStatus };

      if (nextStatus === "Watched") {
        const entered = window.prompt(
          `Enter a rating from 1 to 10 for "${movie.title}":`,
          "8"
        );
        if (entered === null) return;

        const value = Number(entered);
        if (!Number.isInteger(value) || value < 1 || value > 10) {
          setError("Rating must be a whole number from 1 to 10.");
          return;
        }
        payload.rating = value;
      }

      await request(`${API}/${movie._id}/status`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setNotice("Movie status updated.");
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function editRating(movie) {
    const entered = window.prompt(
      `New rating for "${movie.title}" (1–10):`,
      String(movie.rating ?? 8)
    );

    if (entered === null) return;

    const value = Number(entered);
    if (!Number.isInteger(value) || value < 1 || value > 10) {
      setError("Rating must be a whole number from 1 to 10.");
      return;
    }

    try {
      await request(`${API}/${movie._id}/rating`, {
        method: "PATCH",
        body: JSON.stringify({ rating: value }),
      });
      setNotice("Rating updated.");
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteMovie(movie) {
    if (movie.status === "Watching") return;
    if (!window.confirm(`Delete "${movie.title}"? This cannot be undone.`)) return;

    try {
      await request(`${API}/${movie._id}`, { method: "DELETE" });
      setNotice("Movie deleted.");
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function getWatchNext() {
    setError("");
    try {
      setWatchNext(await request(`${API}/watch-next`));
    } catch (err) {
      setWatchNext(null);
      setError(err.message);
    }
  }

  const statusClass = (status) =>
    status.toLowerCase().replaceAll(" ", "-");

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-mark">M</span>
          <span>Frame<span className="brand-accent">List</span></span>
        </a>
        <span className="topbar-label">YOUR PERSONAL CINEMA</span>
        <button className="primary-button" onClick={openAdd}>
          + Add movie
        </button>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">YOUR NEXT GREAT STORY</p>
          <h1>Your watchlist.<br /><span>Your next obsession.</span></h1>
          <p className="hero-description">
            Keep track of what you've watched, what's next,
            and every story worth remembering.
          </p>
          <button className="hero-button" onClick={getWatchNext}>
            <span>▶</span> What should I watch next?
          </button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-ticket">
            <span>NOW SHOWING</span>
            <strong>YOUR<br />NEXT<br />FAVOURITE</strong>
            <span className="ticket-line" />
            <span>ONE STORY AT A TIME</span>
          </div>
          <div className="art-star star-one">✳</div>
          <div className="art-star star-two">✦</div>
        </div>
      </section>

      {error && <div className="alert error-alert">{error}</div>}
      {notice && <div className="alert success-alert">{notice}</div>}

      {watchNext && (
        <section className="recommendation">
          <div>
            <p className="eyebrow">YOUR NEXT PICK</p>
            <h2>{watchNext.title}</h2>
            <p>{watchNext.genre} · {watchNext.runtime} min · Priority {watchNext.priority}/5</p>
            <small>{watchNext.movieCode}</small>
          </div>
          <button className="secondary-button" onClick={() => setWatchNext(null)}>
            Dismiss
          </button>
        </section>
      )}

      <section className="stats-grid">
        <article className="stat-card stat-total">
          <span className="stat-icon">▣</span>
          <p>Total movies</p>
          <strong>{stats ? Object.values(stats.counts).reduce((a, b) => a + b, 0) : "—"}</strong>
          <small>IN YOUR COLLECTION</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon green-icon">◷</span>
          <p>To watch</p>
          <strong>{stats?.counts["To Watch"] ?? "—"}</strong>
          <small>STORIES AWAITING</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon blue-icon">▶</span>
          <p>Watching</p>
          <strong>{stats?.counts.Watching ?? "—"}</strong>
          <small>CURRENTLY IN PROGRESS</small>
        </article>
        <article className="stat-card">
          <span className="stat-icon gold-icon">★</span>
          <p>Watched</p>
          <strong>{stats?.counts.Watched ?? "—"}</strong>
          <small>STORIES COMPLETED</small>
        </article>
      </section>

      <section className="insights-row">
        <article className="insight-card">
          <span className="insight-symbol">◷</span>
          <div><p>Total time watched</p><strong>{stats?.totalHoursWatched ?? 0} <small>hours</small></strong></div>
        </article>
        <article className="insight-card">
          <span className="insight-symbol rating-symbol">★</span>
          <div><p>Average rating</p><strong>{stats?.averageRating ?? "—"} <small>/ 10</small></strong></div>
        </article>
        <article className="insight-card">
          <span className="insight-symbol genre-symbol">✳</span>
          <div><p>Top watched genre</p><strong className="genre-value">{stats?.topWatchedGenre || "—"}</strong></div>
        </article>
      </section>

      <section className="collection-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE COLLECTION</p>
            <h2>Your movies <span>({stats ? Object.values(stats.counts).reduce((a, b) => a + b, 0) : 0})</span></h2>
          </div>
          <button className="outline-button" onClick={openAdd}>+ Add movie</button>
        </div>

        <div className="filters">
          <label className="search-box">
            <span>⌕</span>
            <input
              value={search}
              placeholder="Search movies..."
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </label>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option>To Watch</option>
            <option>Watching</option>
            <option>Watched</option>
          </select>
          <select value={genreFilter} onChange={(e) => { setGenreFilter(e.target.value); setPage(1); }}>
            <option value="">All genres</option>
            {GENRES.map((genre) => <option key={genre}>{genre}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="empty-state"><p>Loading your collection...</p></div>
        ) : movies.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">▧</span>
            <h3>Your next story starts here</h3>
            <p>No movies found. Add a movie or change your filters.</p>
            <button className="primary-button" onClick={openAdd}>+ Add your first movie</button>
          </div>
        ) : (
          <div className="movie-grid">
            {movies.map((movie) => {
              const nextStatuses = {
                "To Watch": ["Watching", "Watched"],
                Watching: ["Watched", "To Watch"],
                Watched: [],
              }[movie.status];

              return (
                <article className="movie-card" key={movie._id}>
                  <div className={`movie-card-art art-${movie.genre.toLowerCase().replace(/[^a-z]/g, "")}`}>
                    <span className="movie-code">{movie.movieCode}</span>
                    <span className="poster-symbol">
                      {movie.genre === "Horror" ? "☾" :
                       movie.genre === "Romance" ? "♡" :
                       movie.genre === "Sci-Fi" ? "✧" :
                       movie.genre === "Action" ? "⚡" :
                       movie.genre === "Comedy" ? "☻" :
                       movie.genre === "Thriller" ? "◈" : "✳"}
                    </span>
                    <span className="poster-genre">{movie.genre}</span>
                  </div>

                  <div className="movie-card-content">
                    <div className="movie-title-row">
                      <h3>{movie.title}</h3>
                      <span className={`status-badge ${statusClass(movie.status)}`}>
                        {movie.status}
                      </span>
                    </div>
                    <p className="movie-meta">{movie.releaseYear} <span>·</span> {movie.runtime} min <span>·</span> {movie.platform}</p>
                    <div className="movie-details">
                      <span className="priority-label">Priority <strong>{movie.priority}/5</strong></span>
                      {movie.rating != null && <button className="rating-button" onClick={() => editRating(movie)}>★ {movie.rating}/10 · Edit</button>}
                    </div>
                    <div className="movie-actions">
                      {nextStatuses.length > 0 && (
                        <select
                          aria-label={`Change status for ${movie.title}`}
                          value={movie.status}
                          onChange={(e) => changeStatus(movie, e.target.value)}
                        >
                          <option value={movie.status}>{movie.status}</option>
                          {nextStatuses.map((status) => <option key={status}>{status}</option>)}
                        </select>
                      )}
                      {movie.status !== "Watched" && <button className="text-action" onClick={() => openEdit(movie)}>Edit</button>}
                      <button
                        className="text-action delete-action"
                        disabled={movie.status === "Watching"}
                        title={movie.status === "Watching" ? "Cannot delete while Watching" : "Delete movie"}
                        onClick={() => deleteMovie(movie)}
                      >Delete</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
          </div>
        )}
      </section>

      {showForm && (
        <div className="modal-backdrop" onMouseDown={(e) => {
          if (e.target === e.currentTarget) setShowForm(false);
        }}>
          <section className="movie-modal" role="dialog" aria-modal="true" aria-labelledby="form-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{editingId ? "REFINE YOUR COLLECTION" : "ADD TO YOUR COLLECTION"}</p>
                <h2 id="form-title">{editingId ? "Edit movie" : "Add a movie"}</h2>
              </div>
              <button className="close-button" onClick={() => setShowForm(false)} aria-label="Close">×</button>
            </div>
            <form onSubmit={saveMovie}>
              <label>Movie title
                <input name="title" value={form.title} onChange={updateField} required maxLength="200" placeholder="e.g. Interstellar" />
              </label>
              <div className="form-two-col">
                <label>Genre
                  <select name="genre" value={form.genre} onChange={updateField}>
                    {GENRES.map((genre) => <option key={genre}>{genre}</option>)}
                  </select>
                </label>
                <label>Release year
                  <input name="releaseYear" type="number" min="1950" max={new Date().getFullYear()} value={form.releaseYear} onChange={updateField} disabled={Boolean(editingId)} required />
                </label>
              </div>
              <div className="form-two-col">
                <label>Runtime (minutes)
                  <input name="runtime" type="number" min="30" max="300" value={form.runtime} onChange={updateField} required />
                </label>
                <label>Platform
                  <select name="platform" value={form.platform} onChange={updateField}>
                    {PLATFORMS.map((platform) => <option key={platform}>{platform}</option>)}
                  </select>
                </label>
              </div>
              <label>Priority <span className="field-hint">5 = highest</span>
                <select name="priority" value={form.priority} onChange={updateField}>
                  {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value}{value === 5 ? " — Highest" : value === 1 ? " — Lowest" : ""}</option>)}
                </select>
              </label>
              {error && <p className="form-error">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="cancel-button" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="primary-button" type="submit">{editingId ? "Save changes" : "Add movie"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      <footer className="footer">
        <span>FrameList <span className="brand-accent">●</span></span>
        <span>Made for stories worth watching.</span>
      </footer>
    </main>
  );
}
