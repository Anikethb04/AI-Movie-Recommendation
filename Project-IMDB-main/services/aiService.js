const { getCachedValue, setCachedValue } = require('../utils/cache');
const tmdbService = require('./tmdbService');
const { buildAnalysisFallback, buildComparisonFallback, parseJsonResponse } = require('../utils/formatters');
const { buildRecommendationPrompt, buildMovieInsightPrompt, buildComparisonPrompt } = require('../ai/prompts');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

const genreKeywords = {
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  horror: 27,
  music: 10402,
  mystery: 9648,
  romance: 10749,
  'sci-fi': 878,
  scifi: 878,
  science: 878,
  thriller: 53,
  war: 10752,
  western: 37,
};

const languageKeywords = {
  telugu: 'te',
  hindi: 'hi',
  tamil: 'ta',
  malayalam: 'ml',
  kannada: 'kn',
  english: 'en',
  korean: 'ko',
  japanese: 'ja',
  spanish: 'es',
};

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

exports.normalizePreferencePayload = (rawPreferences) => {
  if (!rawPreferences) {
    return {
      favoriteGenres: [],
      favoriteActors: [],
      favoriteDirectors: [],
      favoriteLanguages: [],
      favoriteMovies: [],
    };
  }

  const preferences = typeof rawPreferences === 'string' ? JSON.parse(rawPreferences) : rawPreferences;

  return {
    favoriteGenres: normalizeStringList(preferences.favoriteGenres),
    favoriteActors: normalizeStringList(preferences.favoriteActors),
    favoriteDirectors: normalizeStringList(preferences.favoriteDirectors),
    favoriteLanguages: normalizeStringList(preferences.favoriteLanguages),
    favoriteMovies: normalizeStringList(preferences.favoriteMovies),
  };
};

function extractIntent(prompt, preferences = {}) {
  const loweredPrompt = prompt.toLowerCase();
  const genreIds = [];
  let originalLanguage;
  let mediaType = loweredPrompt.includes('series') || loweredPrompt.includes('show') || loweredPrompt.includes('tv')
    ? 'tv'
    : 'movie';

  Object.entries(genreKeywords).forEach(([keyword, genreId]) => {
    if (loweredPrompt.includes(keyword) && !genreIds.includes(genreId)) {
      genreIds.push(genreId);
    }
  });

  const matchedLanguage = Object.entries(languageKeywords).find(([keyword]) => loweredPrompt.includes(keyword));
  if (matchedLanguage) {
    originalLanguage = matchedLanguage[1];
  } else if (preferences.favoriteLanguages && preferences.favoriteLanguages.length) {
    const favoriteLanguage = preferences.favoriteLanguages[0].toLowerCase();
    originalLanguage = languageKeywords[favoriteLanguage] || undefined;
  }

  const releaseYearMatch = loweredPrompt.match(/after\s+(20\d{2}|19\d{2})/i) || loweredPrompt.match(/since\s+(20\d{2}|19\d{2})/i);
  const releaseDateGte = releaseYearMatch ? `${releaseYearMatch[1]}-01-01` : undefined;

  return {
    genreIds,
    mediaType,
    originalLanguage,
    releaseDateGte,
    wantsSimilar: loweredPrompt.includes('like ') || loweredPrompt.includes('similar to'),
    wantsFamilyFriendly: loweredPrompt.includes('family') || loweredPrompt.includes('kids'),
  };
}

function scoreCandidate(movie, prompt, intent, preferences = {}) {
  const loweredPrompt = prompt.toLowerCase();
  let score = Math.round((movie.rating || 0) * 8);
  const haystack = `${movie.title} ${movie.overview} ${safeArray(movie.genreNames).join(' ')} ${movie.language || ''}`.toLowerCase();

  if (intent.genreIds.length && movie.genreIds) {
    score += intent.genreIds.filter((genreId) => movie.genreIds.includes(genreId)).length * 18;
  }

  if (intent.originalLanguage && movie.language === intent.originalLanguage) {
    score += 20;
  }

  if (intent.releaseDateGte && movie.releaseDate && movie.releaseDate >= intent.releaseDateGte) {
    score += 14;
  }

  if (intent.wantsFamilyFriendly && safeArray(movie.genreNames).some((genreName) => genreName === 'Family' || genreName === 'Animation')) {
    score += 20;
  }

  const preferenceKeywords = [
    ...safeArray(preferences.favoriteGenres),
    ...safeArray(preferences.favoriteMovies),
    ...safeArray(preferences.favoriteActors),
  ].map((item) => item.toLowerCase());

  preferenceKeywords.forEach((keyword) => {
    if (keyword && haystack.includes(keyword)) {
      score += 6;
    }
  });

  loweredPrompt.split(/\s+/).forEach((token) => {
    if (token.length > 3 && haystack.includes(token)) {
      score += 3;
    }
  });

  return score;
}

async function fetchGeminiJson(prompt) {
  if (!GEMINI_API_KEY) {
    return null;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.6,
          responseMimeType: 'application/json',
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Gemini request failed: ${payload}`);
  }

  const payload = await response.json();
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') || '';
  return parseJsonResponse(text);
}

async function buildCandidatePool(prompt, preferences = {}) {
  const intent = extractIntent(prompt, preferences);
  const [searchMatches, discoverMatches, fallbackSection] = await Promise.all([
    tmdbService.searchTitles(prompt, { limit: 8 }).catch(() => []),
    tmdbService.discoverTitles({
      genreIds: intent.genreIds,
      originalLanguage: intent.originalLanguage,
      releaseDateGte: intent.releaseDateGte,
      mediaType: intent.mediaType,
      limit: 10,
    }).catch(() => []),
    tmdbService.getHomeSections().catch(() => ({ sections: [] })),
  ]);

  const additionalMatches = fallbackSection.sections?.flatMap((section) => section.items).slice(0, 20) || [];
  const combined = [...searchMatches, ...discoverMatches, ...additionalMatches]
    .filter(Boolean)
    .filter((movie, index, collection) => {
      return collection.findIndex((candidate) => candidate.id === movie.id && candidate.mediaType === movie.mediaType) === index;
    });

  return {
    intent,
    candidates: combined,
  };
}

exports.generateMovieReasoning = (movie, prompt, preferences = {}) => {
  const reasons = [];

  if (preferences.favoriteGenres.some((genre) => safeArray(movie.genreNames).includes(genre))) {
    reasons.push(`Matches your preference for ${preferences.favoriteGenres.find((genre) => safeArray(movie.genreNames).includes(genre))}`);
  }

  if (movie.overview && prompt) {
    reasons.push(`Its story tone lines up with "${prompt}"`);
  }

  if (movie.rating >= 7.5) {
    reasons.push(`Strong TMDB rating of ${movie.rating.toFixed(1)}`);
  }

  if (!reasons.length) {
    reasons.push('A strong thematic fit based on genre, tone, and audience response');
  }

  return reasons.slice(0, 2).join('. ');
};

exports.generatePersonalizedSuggestions = async (preferences = {}) => {
  const promptParts = [];

  if (preferences.favoriteGenres.length) {
    promptParts.push(`genres: ${preferences.favoriteGenres.join(', ')}`);
  }

  if (preferences.favoriteMovies.length) {
    promptParts.push(`favorite movies: ${preferences.favoriteMovies.join(', ')}`);
  }

  if (preferences.favoriteLanguages.length) {
    promptParts.push(`languages: ${preferences.favoriteLanguages.join(', ')}`);
  }

  const prompt = promptParts.length
    ? `Recommend titles for a viewer who likes ${promptParts.join(' | ')}`
    : 'Recommend widely loved crowd-pleasing movies';

  return exports.getMovieRecommendations({ prompt, preferences, limit: 6 });
};

exports.getMovieRecommendations = async ({ prompt, preferences = {}, chatHistory = [], limit = 6 }) => {
  const normalizedPreferences = exports.normalizePreferencePayload(preferences);
  const cacheKey = `ai:recommend:${prompt}:${JSON.stringify(normalizedPreferences)}:${limit}`;
  const cached = getCachedValue(cacheKey);
  if (cached) {
    return cached;
  }

  const { intent, candidates } = await buildCandidatePool(prompt, normalizedPreferences);
  const rankedCandidates = candidates
    .map((movie) => ({
      ...movie,
      similarityScore: Math.min(99, scoreCandidate(movie, prompt, intent, normalizedPreferences)),
    }))
    .sort((left, right) => right.similarityScore - left.similarityScore)
    .slice(0, 12);

  let recommendations;

  try {
    const aiResponse = await fetchGeminiJson(buildRecommendationPrompt({
      prompt,
      preferences: normalizedPreferences,
      chatHistory,
      candidates: rankedCandidates,
      limit,
    }));

    if (Array.isArray(aiResponse?.recommendations) && aiResponse.recommendations.length) {
      recommendations = aiResponse.recommendations
        .map((recommendation) => {
          const matchedMovie = rankedCandidates.find((movie) => String(movie.id) === String(recommendation.id) || movie.title === recommendation.title);
          if (!matchedMovie) {
            return null;
          }

          return {
            ...matchedMovie,
            whyItMatches: recommendation.whyItMatches || exports.generateMovieReasoning(matchedMovie, prompt, normalizedPreferences),
            similarityScore: Number(recommendation.similarityScore) || matchedMovie.similarityScore,
          };
        })
        .filter(Boolean)
        .slice(0, limit);
    }
  } catch (error) {
    console.warn('Gemini recommendation request failed. Falling back to heuristic recommendations.', error.message);
  }

  if (!recommendations || !recommendations.length) {
    recommendations = rankedCandidates.slice(0, limit).map((movie) => ({
      ...movie,
      whyItMatches: exports.generateMovieReasoning(movie, prompt, normalizedPreferences),
      similarityScore: movie.similarityScore,
    }));
  }

  setCachedValue(cacheKey, recommendations, 1000 * 60 * 10);
  return recommendations;
};

exports.getMovieAnalysis = async ({ movie, similarMovies = [] }) => {
  const cacheKey = `ai:analysis:${movie.mediaType}:${movie.id}`;
  const cached = getCachedValue(cacheKey);
  if (cached) {
    return cached;
  }

  let analysis;

  try {
    analysis = await fetchGeminiJson(buildMovieInsightPrompt({ movie, similarMovies }));
  } catch (error) {
    console.warn('Gemini movie insight request failed. Falling back to deterministic analysis.', error.message);
  }

  if (!analysis || !analysis.summary) {
    analysis = buildAnalysisFallback(movie, similarMovies);
  }

  setCachedValue(cacheKey, analysis, 1000 * 60 * 20);
  return analysis;
};

exports.compareMovies = async (leftMovie, rightMovie) => {
  const cacheKey = `ai:compare:${leftMovie.mediaType}:${leftMovie.id}:${rightMovie.mediaType}:${rightMovie.id}`;
  const cached = getCachedValue(cacheKey);
  if (cached) {
    return cached;
  }

  let comparison;

  try {
    comparison = await fetchGeminiJson(buildComparisonPrompt({ leftMovie, rightMovie }));
  } catch (error) {
    console.warn('Gemini comparison request failed. Falling back to deterministic comparison.', error.message);
  }

  if (!comparison || !comparison.winner) {
    comparison = buildComparisonFallback(leftMovie, rightMovie);
  }

  setCachedValue(cacheKey, comparison, 1000 * 60 * 20);
  return comparison;
};
