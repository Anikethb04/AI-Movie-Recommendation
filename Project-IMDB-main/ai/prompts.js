function stringify(value) {
  return JSON.stringify(value, null, 2);
}

exports.buildRecommendationPrompt = ({ prompt, preferences, chatHistory, candidates, limit }) => {
  return [
    'You are an expert movie and TV recommendation engine.',
    'Return valid JSON only.',
    'Pick the best candidate matches for the user prompt.',
    `Return this shape: {"recommendations":[{"id":"number|string","title":"string","whyItMatches":"string","similarityScore":"number"}]}.`,
    `Limit recommendations to ${limit}.`,
    `User prompt: ${prompt}`,
    `User preferences: ${stringify(preferences)}`,
    `Recent chat context: ${stringify(chatHistory.slice(-4))}`,
    `Candidate titles: ${stringify(candidates)}`,
  ].join('\n');
};

exports.buildMovieInsightPrompt = ({ movie, similarMovies }) => {
  return [
    'You are an insightful film analyst.',
    'Return valid JSON only.',
    'Return this shape:',
    '{"summary":"string","strengths":["string"],"weaknesses":["string"],"whoShouldWatch":["string"],"whoShouldSkip":["string"],"funFacts":["string"],"audienceInsights":"string","recommendationScore":0}',
    `Movie data: ${stringify(movie)}`,
    `Similar movies: ${stringify(similarMovies)}`,
  ].join('\n');
};

exports.buildComparisonPrompt = ({ leftMovie, rightMovie }) => {
  return [
    'You compare movies for recommendation decisions.',
    'Return valid JSON only.',
    'Return this shape:',
    '{"winner":"string","verdict":"string","winnerSummary":"string","categories":[{"label":"string","left":"string","right":"string","winner":"string"}]}',
    `Left movie: ${stringify(leftMovie)}`,
    `Right movie: ${stringify(rightMovie)}`,
  ].join('\n');
};
