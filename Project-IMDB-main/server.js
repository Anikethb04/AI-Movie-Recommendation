const express = require('express');
const path = require('path');
const aiService = require('./services/aiService');
const tmdbService = require('./services/tmdbService');

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS + preflight support for browser POSTs (Netlify functions preflight may hit OPTIONS)
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use((err, req, res, next) => {
    if ((err instanceof SyntaxError || err.type === 'entity.parse.failed') && err.status === 400 && 'body' in err) {
        console.error('Invalid JSON payload:', err.message);
        return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    next(err);
});

app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
});

app.use(express.static(__dirname));

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

async function tmdbFetch(endpoint) {
    if (!TMDB_API_KEY) {
        const error = new Error('TMDB_API_KEY is not configured');
        error.statusCode = 500;
        throw error;
    }
    const response = await fetch(`${TMDB_BASE_URL}${endpoint}`);
    const data = await response.json();

    if (!response.ok) {
        const error = new Error(data.status_message || 'TMDB request failed');
        error.statusCode = response.status;
        throw error;
    }

    return data;
}

function formatLegacyCard(item) {
    return {
        id: item.id,
        name: item.title || item.name,
        imdb: Number(item.vote_average || 0),
        date: (item.release_date || item.first_air_date || '2024').split('-')[0],
        sposter: item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : 'https://via.placeholder.com/200x300/1a1a1a/ffffff?text=No+Poster',
        bposter: item.backdrop_path ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` : 'https://via.placeholder.com/500x281/1a1a1a/ffffff?text=No+Image',
        genre: item.media_type === 'tv' ? 'TV Series' : 'Movie',
        type: item.media_type === 'tv' ? 'series' : 'movie',
        media_type: item.media_type || 'movie',
        overview: item.overview || 'No description available'
    };
}

app.get('/api/movies', async (req, res) => {
    try {
        const [popularResponse, topRatedResponse, trendingResponse] = await Promise.all([
            tmdbFetch(`/movie/popular?api_key=${TMDB_API_KEY}&language=en-US&page=1`),
            tmdbFetch(`/movie/top_rated?api_key=${TMDB_API_KEY}&language=en-US&page=1`),
            tmdbFetch(`/trending/all/week?api_key=${TMDB_API_KEY}`)
        ]);

        const allMovies = [
            ...popularResponse.results.slice(0, 5),
            ...topRatedResponse.results.slice(0, 5),
            ...trendingResponse.results.slice(0, 5)
        ];

        res.json(allMovies.map(formatLegacyCard));
    } catch (error) {
        console.error('Error fetching from TMDB:', error);
        res.status(error.statusCode || 500).json({ error: 'Failed to fetch movies' });
    }
});

app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) {
            return res.json([]);
        }

        const data = await tmdbFetch(`/search/multi?api_key=${TMDB_API_KEY}&language=en-US&query=${encodeURIComponent(query)}&page=1`);

        let formattedResults = (data.results || [])
            .filter(item => item.media_type === 'movie' || item.media_type === 'tv')
            .slice(0, 10)
            .map(formatLegacyCard);

        // If TMDB produced no useful results, fall back to AI-powered recommendations
        if (!formattedResults || formattedResults.length === 0) {
            try {
                const aiResults = await aiService.getMovieRecommendations({ prompt: query, limit: 10 });
                const mapped = (aiResults || []).map(item => ({
                    id: item.id,
                    name: item.title || item.name || item.name,
                    imdb: Number(item.imdb || item.rating || 0),
                    date: item.date || item.year || (item.releaseDate ? item.releaseDate.split('-')[0] : 'N/A'),
                    sposter: item.sposter || item.poster || (item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : 'https://via.placeholder.com/200x300/1a1a1a/ffffff?text=No+Poster'),
                    bposter: item.bposter || item.backdrop || (item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : 'https://via.placeholder.com/500x281/1a1a1a/ffffff?text=No+Image'),
                    genre: item.genre || (item.genreNames && item.genreNames[0]) || 'Movie',
                    type: item.type || (item.media_type === 'tv' ? 'series' : 'movie'),
                    media_type: item.mediaType || item.media_type || 'movie',
                    overview: item.overview || ''
                }));

                formattedResults = mapped;
            } catch (aiErr) {
                console.warn('AI search fallback failed:', aiErr.message);
            }
        }

        res.json(formattedResults);
    } catch (error) {
        console.error('Error searching TMDB:', error);
        res.status(error.statusCode || 500).json({ error: 'Failed to search movies' });
    }
});

// Personalized recommendations endpoint (consumes client-side local preferences)
app.post('/api/personalized', async (req, res) => {
    try {
        const preferences = req.body && req.body.preferences ? req.body.preferences : {};
        const recs = await aiService.generatePersonalizedSuggestions(preferences);
        res.json({ recommendations: recs });
    } catch (err) {
        console.error('Personalized recommendations error:', err);
        res.status(500).json({ error: 'Failed to generate personalized recommendations' });
    }
});

// Movie AI-similar: produces AI-backed similar recommendations for a movie
app.get('/api/movie/:id/ai-similar', async (req, res) => {
    try {
        const { id } = req.params;
        const mediaType = req.query.type || 'movie';

        // Get the base movie details (best-effort)
        const movie = await tmdbService.getMovieDetails(id, mediaType).catch(() => null);

        const prompt = movie && movie.title ? `Recommend movies similar to ${movie.title}` : `Recommend movies similar to this title`;
        const recommendations = await aiService.getMovieRecommendations({ prompt, limit: 8 });

        res.json({ recommendations });
    } catch (err) {
        console.error('AI similar route error:', err);
        res.status(500).json({ error: 'Failed to generate AI similar movies' });
    }
});

app.get('/api/trending-regional', async (req, res) => {
    try {
        const [indiaData, usData] = await Promise.all([
            tmdbFetch(`/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&sort_by=popularity.desc&watch_region=IN&with_original_language=hi|ta|te`),
            tmdbFetch(`/discover/movie?api_key=${TMDB_API_KEY}&language=en-US&sort_by=popularity.desc&watch_region=US&with_original_language=en`)
        ]);

        const combinedMovies = [...indiaData.results.slice(0, 10), ...usData.results.slice(0, 10)];

        const formattedData = combinedMovies.map(item => ({
            id: item.id,
            name: item.title || item.name,
            imdb: Number(item.vote_average || 0),
            date: (item.release_date || item.first_air_date || '2024').split('-')[0],
            sposter: item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : 'https://via.placeholder.com/200x300/1a1a1a/ffffff?text=No+Poster',
            bposter: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : 'https://via.placeholder.com/1920x1080/1a1a1a/ffffff?text=No+Image',
            genre: item.media_type === 'tv' ? 'TV Series' : 'Movie',
            type: item.media_type === 'tv' ? 'series' : 'movie',
            media_type: item.media_type || 'movie',
            overview: item.overview || 'No description available'
        }));

        res.json(formattedData);
    } catch (error) {
        console.error('Error fetching trending regional movies:', error);
        res.status(error.statusCode || 500).json({ error: 'Failed to fetch trending movies' });
    }
});

app.get('/api/movie/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const mediaType = req.query.type || 'movie';

        const [details, credits, reviews] = await Promise.all([
            tmdbFetch(`/${mediaType}/${id}?api_key=${TMDB_API_KEY}&language=en-US`),
            tmdbFetch(`/${mediaType}/${id}/credits?api_key=${TMDB_API_KEY}`),
            tmdbFetch(`/${mediaType}/${id}/reviews?api_key=${TMDB_API_KEY}&language=en-US&page=1`)
        ]);

        const movieData = {
            id: details.id,
            title: details.title || details.name,
            overview: details.overview,
            rating: Number(details.vote_average || 0),
            vote_count: Number(details.vote_count || 0),
            release_date: details.release_date || details.first_air_date,
            runtime: details.runtime || (details.episode_run_time && details.episode_run_time[0]),
            genres: details.genres,
            poster: details.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : null,
            backdrop: details.backdrop_path ? `https://image.tmdb.org/t/p/original${details.backdrop_path}` : null,
            tagline: details.tagline,
            status: details.status,
            budget: details.budget,
            revenue: details.revenue,
            cast: credits.cast.slice(0, 10).map(person => ({
                name: person.name,
                character: person.character,
                profile: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null
            })),
            crew: credits.crew.filter(person =>
                person.job === 'Director' || person.job === 'Producer' || person.job === 'Writer'
            ).slice(0, 5).map(person => ({
                name: person.name,
                job: person.job,
                profile: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null
            })),
            reviews: reviews.results.slice(0, 5).map(review => ({
                author: review.author,
                content: review.content,
                rating: review.author_details.rating,
                created_at: review.created_at
            }))
        };

        res.json(movieData);
    } catch (error) {
        console.error('Error fetching movie details:', error);
        res.status(error.statusCode || 500).json({ error: 'Failed to fetch movie details' });
    }
});

app.post('/api/ai-recommend', async (req, res) => {
    try {
        const prompt = String(req.body.prompt || '').trim();

        if (!prompt) {
            return res.status(400).json({ error: 'prompt is required' });
        }

        const recommendations = await aiService.getMovieRecommendations({
            prompt,
            preferences: aiService.normalizePreferencePayload(req.body.preferences),
            chatHistory: Array.isArray(req.body.chatHistory) ? req.body.chatHistory : [],
            limit: Number(req.body.limit) || 5
        });

        res.json({
            prompt,
            recommendations,
            generatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error generating AI recommendations:', error);
        res.status(error.statusCode || 500).json({ error: 'Failed to generate AI recommendations' });
    }
});

app.get('/api/movie/:id/ai-insights', async (req, res) => {
    try {
        const { id } = req.params;
        const mediaType = req.query.type || 'movie';

        const [movie, similarMovies] = await Promise.all([
            tmdbService.getMovieDetails(id, mediaType),
            tmdbService.getSimilarTitles(id, mediaType)
        ]);

        const insights = await aiService.getMovieAnalysis({
            movie,
            similarMovies
        });

        res.json(insights);
    } catch (error) {
        console.error('Error generating AI insights:', error);
        res.status(error.statusCode || 500).json({ error: 'Failed to generate AI insights' });
    }
});

app.get('/movie-details.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'movie-details.html'));
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = Number(process.env.PORT) || 5000;

function startServer(port, attempts = 0) {
    const server = app.listen(port, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${port}`);
    });

    server.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE' && attempts < 5) {
            console.warn(`Port ${port} in use, trying ${port + 1}...`);
            setTimeout(() => startServer(port + 1, attempts + 1), 200);
            return;
        }
        console.error('Failed to start server:', err);
        process.exit(1);
    });

    return server;
}

if (require.main === module) {
    startServer(PORT);
}

module.exports = app;
