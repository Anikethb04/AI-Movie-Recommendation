const { getCachedValue, setCachedValue } = require('../utils/cache');
const { buildMediaCard, buildMovieDetails, ensureArray } = require('../utils/formatters');

const TMDB_API_KEY = process.env.TMDB_API_KEY || '';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const DEFAULT_LANGUAGE = 'en-US';

if (!TMDB_API_KEY) {
  console.warn('TMDB_API_KEY is not set. API requests will fail until an environment variable is provided.');
}

function buildUrl(endpoint, params = {}) {
  const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
  url.searchParams.set('api_key', TMDB_API_KEY);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  return url.toString();
}

async function tmdbFetch(endpoint, params = {}) {
  const response = await fetch(buildUrl(endpoint, params));
  const payload = await response.json();

  if (!response.ok) {
    const error = new Error(payload.status_message || `TMDB request failed for ${endpoint}`);
    error.statusCode = response.status;
    throw error;
  }

  return payload;
}

async function getGenreMaps() {
  const cacheKey = 'tmdb:genres';
  const cached = getCachedValue(cacheKey);
  if (cached) {
    return cached;
  }

  const [movieGenres, tvGenres] = await Promise.all([
    tmdbFetch('/genre/movie/list', { language: DEFAULT_LANGUAGE }),
    tmdbFetch('/genre/tv/list', { language: DEFAULT_LANGUAGE }),
  ]);

  const maps = {
    movie: Object.fromEntries(movieGenres.genres.map((genre) => [genre.id, genre.name])),
    tv: Object.fromEntries(tvGenres.genres.map((genre) => [genre.id, genre.name])),
  };

  setCachedValue(cacheKey, maps, 1000 * 60 * 60 * 24);
  return maps;
}

async function getListCache(cacheKey, endpoint, params = {}) {
  const cached = getCachedValue(cacheKey);
  if (cached) {
    return cached;
  }

  const payload = await tmdbFetch(endpoint, params);
  setCachedValue(cacheKey, payload, 1000 * 60 * 20);
  return payload;
}

function dedupeItems(items) {
  return items.filter((item, index, collection) => {
    return collection.findIndex((candidate) => candidate.id === item.id && candidate.mediaType === item.mediaType) === index;
  });
}

async function listToCards(cacheKey, endpoint, params = {}, fallbackType) {
  const genreMaps = await getGenreMaps();
  const payload = await getListCache(cacheKey, endpoint, params);
  return ensureArray(payload.results).map((item) => buildMediaCard(item, genreMaps, fallbackType));
}

exports.searchTitles = async (query, options = {}) => {
  const genreMaps = await getGenreMaps();
  const payload = await tmdbFetch('/search/multi', {
    language: DEFAULT_LANGUAGE,
    query,
    include_adult: false,
    page: options.page || 1,
  });

  return ensureArray(payload.results)
    .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
    .slice(0, options.limit || 10)
    .map((item) => buildMediaCard(item, genreMaps));
};

exports.getTrendingRegional = async () => {
  const [indianTitles, englishTitles] = await Promise.all([
    listToCards(
      'tmdb:discover:india',
      '/discover/movie',
      {
        language: DEFAULT_LANGUAGE,
        sort_by: 'popularity.desc',
        page: 1,
        with_origin_country: 'IN',
      },
      'movie'
    ),
    listToCards(
      'tmdb:discover:english',
      '/discover/movie',
      {
        language: DEFAULT_LANGUAGE,
        sort_by: 'popularity.desc',
        page: 1,
        with_original_language: 'en',
      },
      'movie'
    ),
  ]);

  return dedupeItems([...indianTitles.slice(0, 10), ...englishTitles.slice(0, 10)]);
};

exports.getHomeSections = async () => {
  const [
    trendingNow,
    popularMovies,
    topRatedMovies,
    topTvShows,
    popularInIndia,
    regionalCinema,
    teluguHits,
    hindiBlockbusters,
    tamilFavorites,
  ] = await Promise.all([
    listToCards('tmdb:home:trending', '/trending/all/week', {}, undefined),
    listToCards('tmdb:home:popular', '/movie/popular', { language: DEFAULT_LANGUAGE, page: 1 }, 'movie'),
    listToCards('tmdb:home:top-rated', '/movie/top_rated', { language: DEFAULT_LANGUAGE, page: 1 }, 'movie'),
    listToCards('tmdb:home:top-tv', '/tv/top_rated', { language: DEFAULT_LANGUAGE, page: 1 }, 'tv'),
    listToCards(
      'tmdb:home:india-popular',
      '/discover/movie',
      { language: DEFAULT_LANGUAGE, sort_by: 'popularity.desc', page: 1, watch_region: 'IN', region: 'IN' },
      'movie'
    ),
    listToCards(
      'tmdb:home:regional',
      '/discover/movie',
      { language: DEFAULT_LANGUAGE, sort_by: 'popularity.desc', page: 1, with_origin_country: 'IN' },
      'movie'
    ),
    listToCards(
      'tmdb:home:telugu',
      '/discover/movie',
      { language: DEFAULT_LANGUAGE, sort_by: 'vote_average.desc', page: 1, vote_count_gte: 150, with_original_language: 'te' },
      'movie'
    ),
    listToCards(
      'tmdb:home:hindi',
      '/discover/movie',
      { language: DEFAULT_LANGUAGE, sort_by: 'popularity.desc', page: 1, with_original_language: 'hi' },
      'movie'
    ),
    listToCards(
      'tmdb:home:tamil',
      '/discover/movie',
      { language: DEFAULT_LANGUAGE, sort_by: 'popularity.desc', page: 1, with_original_language: 'ta' },
      'movie'
    ),
  ]);

  const hero = dedupeItems([...trendingNow, ...popularMovies, ...popularInIndia]).find(Boolean) || null;

  return {
    hero,
    sections: [
      { id: 'trending-now', title: 'Trending Now', items: trendingNow.slice(0, 12) },
      { id: 'popular-in-india', title: 'Popular In India', items: popularInIndia.slice(0, 12) },
      { id: 'top-rated-movies', title: 'Top Rated Movies', items: topRatedMovies.slice(0, 12) },
      { id: 'top-tv', title: 'Top TV Shows', items: topTvShows.slice(0, 12) },
      { id: 'regional-cinema', title: 'Regional Cinema', items: regionalCinema.slice(0, 12) },
      { id: 'telugu-hits', title: 'Telugu Hits', items: teluguHits.slice(0, 12) },
      { id: 'hindi-blockbusters', title: 'Hindi Blockbusters', items: hindiBlockbusters.slice(0, 12) },
      { id: 'tamil-favorites', title: 'Tamil Favorites', items: tamilFavorites.slice(0, 12) },
      { id: 'popular-movies', title: 'Popular Movies', items: popularMovies.slice(0, 12) },
    ],
  };
};

exports.discoverTitles = async (filters = {}) => {
  const genreMaps = await getGenreMaps();
  const releaseKey = filters.mediaType === 'tv' ? 'first_air_date.gte' : 'primary_release_date.gte';
  const releaseUpperKey = filters.mediaType === 'tv' ? 'first_air_date.lte' : 'primary_release_date.lte';
  const params = {
    language: DEFAULT_LANGUAGE,
    include_adult: false,
    sort_by: filters.sortBy || 'popularity.desc',
    page: filters.page || 1,
    with_genres: filters.genreIds && filters.genreIds.length ? filters.genreIds.join(',') : undefined,
    with_original_language: filters.originalLanguage,
    with_origin_country: filters.originCountry,
    vote_count_gte: filters.voteCountGte || 80,
  };

  if (filters.releaseDateGte) {
    params[releaseKey] = filters.releaseDateGte;
  }

  if (filters.releaseDateLte) {
    params[releaseUpperKey] = filters.releaseDateLte;
  }

  const endpoint = filters.mediaType === 'tv' ? '/discover/tv' : '/discover/movie';
  const payload = await tmdbFetch(endpoint, params);

  return ensureArray(payload.results)
    .slice(0, filters.limit || 12)
    .map((item) => buildMediaCard(item, genreMaps, filters.mediaType || 'movie'));
};

exports.getMovieDetails = async (id, mediaType = 'movie') => {
  const cacheKey = `tmdb:details:${mediaType}:${id}`;
  const cached = getCachedValue(cacheKey);
  if (cached) {
    return cached;
  }

  const [details, credits, reviews, recommendations, videos] = await Promise.all([
    tmdbFetch(`/${mediaType}/${id}`, { language: DEFAULT_LANGUAGE }),
    tmdbFetch(`/${mediaType}/${id}/credits`, { language: DEFAULT_LANGUAGE }),
    tmdbFetch(`/${mediaType}/${id}/reviews`, { language: DEFAULT_LANGUAGE, page: 1 }),
    tmdbFetch(`/${mediaType}/${id}/recommendations`, { language: DEFAULT_LANGUAGE, page: 1 }),
    tmdbFetch(`/${mediaType}/${id}/videos`, { language: DEFAULT_LANGUAGE }),
  ]);

  const genreMaps = await getGenreMaps();
  const movieDetails = buildMovieDetails({
    details,
    credits,
    reviews,
    recommendations,
    videos,
    genreMaps,
    mediaType,
  });

  setCachedValue(cacheKey, movieDetails, 1000 * 60 * 20);
  return movieDetails;
};

exports.getSimilarTitles = async (id, mediaType = 'movie') => {
  const cacheKey = `tmdb:similar:${mediaType}:${id}`;
  const cached = getCachedValue(cacheKey);
  if (cached) {
    return cached;
  }

  const genreMaps = await getGenreMaps();
  const payload = await tmdbFetch(`/${mediaType}/${id}/recommendations`, {
    language: DEFAULT_LANGUAGE,
    page: 1,
  });

  const items = ensureArray(payload.results)
    .slice(0, 10)
    .map((item) => buildMediaCard(item, genreMaps, mediaType));

  setCachedValue(cacheKey, items, 1000 * 60 * 20);
  return items;
};
