const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

function imageUrl(path, size, fallbackText) {
  if (!path) {
    return `https://via.placeholder.com/${size === 'original' ? '1280x720' : size.replace('w', '') + 'x' + Math.round(Number(size.replace('w', '')) * 1.5)}/111827/e5e7eb?text=${encodeURIComponent(fallbackText)}`;
  }

  return `${IMAGE_BASE_URL}/${size}${path}`;
}

exports.ensureArray = (value) => (Array.isArray(value) ? value : []);

exports.buildMediaCard = (item, genreMaps = { movie: {}, tv: {} }, fallbackType = 'movie') => {
  const mediaType = item.media_type || fallbackType;
  const genreIds = exports.ensureArray(item.genre_ids);
  const genreNames = genreIds.map((genreId) => genreMaps[mediaType]?.[genreId]).filter(Boolean);
  const releaseDate = item.release_date || item.first_air_date || '';
  const title = item.title || item.name || 'Untitled';

  return {
    id: item.id,
    title,
    name: title,
    rating: Number(item.vote_average || 0),
    imdb: Number(item.vote_average || 0),
    releaseDate,
    date: releaseDate ? releaseDate.split('-')[0] : 'N/A',
    year: releaseDate ? releaseDate.split('-')[0] : 'N/A',
    poster: imageUrl(item.poster_path, 'w342', 'No Poster'),
    sposter: imageUrl(item.poster_path, 'w342', 'No Poster'),
    backdrop: imageUrl(item.backdrop_path, 'original', 'No Backdrop'),
    bposter: imageUrl(item.backdrop_path, 'original', 'No Backdrop'),
    genreNames,
    genre: genreNames[0] || (mediaType === 'tv' ? 'TV Series' : 'Movie'),
    mediaType,
    type: mediaType === 'tv' ? 'series' : 'movie',
    overview: item.overview || 'No description available.',
    popularity: Number(item.popularity || 0),
    language: item.original_language || '',
    genreIds,
  };
};

exports.buildMovieDetails = ({ details, credits, reviews, recommendations, videos, genreMaps, mediaType }) => {
  const recommendationCards = exports.ensureArray(recommendations.results).map((item) => {
    return exports.buildMediaCard(item, genreMaps, mediaType);
  });

  const trailer = exports.ensureArray(videos.results).find((video) => {
    return video.site === 'YouTube' && (video.type === 'Trailer' || video.type === 'Teaser');
  });

  return {
    id: details.id,
    title: details.title || details.name,
    overview: details.overview || 'No overview available.',
    rating: Number(details.vote_average || 0),
    voteCount: Number(details.vote_count || 0),
    releaseDate: details.release_date || details.first_air_date || '',
    runtime: details.runtime || exports.ensureArray(details.episode_run_time)[0] || 0,
    genres: exports.ensureArray(details.genres),
    genreNames: exports.ensureArray(details.genres).map((genre) => genre.name),
    genreIds: exports.ensureArray(details.genres).map((genre) => genre.id),
    poster: imageUrl(details.poster_path, 'w500', 'No Poster'),
    backdrop: imageUrl(details.backdrop_path, 'original', 'No Backdrop'),
    tagline: details.tagline || '',
    status: details.status || 'Unknown',
    budget: Number(details.budget || 0),
    revenue: Number(details.revenue || 0),
    language: details.original_language || '',
    popularity: Number(details.popularity || 0),
    mediaType,
    cast: exports.ensureArray(credits.cast).slice(0, 10).map((person) => ({
      id: person.id,
      name: person.name,
      character: person.character,
      profile: imageUrl(person.profile_path, 'w185', person.name?.charAt(0) || 'Cast'),
    })),
    crew: exports.ensureArray(credits.crew)
      .filter((person) => ['Director', 'Producer', 'Writer', 'Screenplay'].includes(person.job))
      .slice(0, 8)
      .map((person) => ({
        id: person.id,
        name: person.name,
        job: person.job,
        profile: imageUrl(person.profile_path, 'w185', person.name?.charAt(0) || 'Crew'),
      })),
    reviews: exports.ensureArray(reviews.results).slice(0, 5).map((review) => ({
      author: review.author,
      content: review.content,
      rating: review.author_details?.rating,
      createdAt: review.created_at,
      url: review.url,
    })),
    similar: recommendationCards.slice(0, 8),
    trailer: trailer
      ? {
          key: trailer.key,
          name: trailer.name,
          url: `https://www.youtube.com/embed/${trailer.key}`,
        }
      : null,
  };
};

exports.parseJsonResponse = (text) => {
  if (!text) {
    return null;
  }

  const cleaned = text.replace(/^```json/, '').replace(/```$/, '').trim();
  return JSON.parse(cleaned);
};

exports.buildAnalysisFallback = (movie, similarMovies) => {
  const genreSummary = movie.genreNames?.length ? movie.genreNames.join(', ') : 'character-driven storytelling';
  const highlyRated = movie.rating >= 7.5;

  return {
    summary: `${movie.title} leans into ${genreSummary.toLowerCase()} with a ${highlyRated ? 'well-received' : 'mixed but intriguing'} audience response.`,
    strengths: [
      highlyRated ? 'Consistently strong audience reception' : 'Distinctive premise that stands out',
      movie.tagline ? `A memorable hook: "${movie.tagline}"` : 'Easy to pitch from its concept alone',
      movie.cast?.length ? `Notable cast led by ${movie.cast[0].name}` : 'Accessible for casual viewers',
    ],
    weaknesses: [
      movie.runtime > 150 ? 'Long runtime may feel demanding for casual viewing' : 'May not fully satisfy viewers expecting nonstop pace',
      movie.reviews?.length ? 'Critical opinions vary depending on tone expectations' : 'Limited review data makes audience fit less predictable',
    ],
    whoShouldWatch: [
      `Viewers who enjoy ${movie.genreNames?.[0] || 'cinema'} with strong mood and atmosphere`,
      'Anyone looking for a recommendation with solid mainstream appeal',
    ],
    whoShouldSkip: [
      movie.runtime > 150 ? 'People who want a shorter, lighter watch' : 'Viewers looking for a radically experimental structure',
      movie.genreNames?.includes('Horror') ? 'Sensitive viewers who avoid intense imagery' : 'People seeking a very niche genre swing',
    ],
    funFacts: [
      `TMDB audience score: ${movie.rating.toFixed(1)} from ${movie.voteCount.toLocaleString()} votes`,
      movie.releaseDate ? `Released in ${movie.releaseDate.slice(0, 4)}` : 'Release date unavailable',
      similarMovies[0] ? `Often grouped with ${similarMovies[0].title}` : 'Recommendation graph is still growing',
    ],
    audienceInsights: highlyRated
      ? 'This title tends to work best for viewers who value polish, emotional payoff, or strong execution.'
      : 'This title often appeals more to viewers who connect with concept and atmosphere than pure consensus buzz.',
    recommendationScore: Math.min(98, Math.max(68, Math.round(movie.rating * 10 + Math.min(movie.popularity / 10, 10)))),
  };
};

exports.buildComparisonFallback = (leftMovie, rightMovie) => {
  const leftScore = leftMovie.rating * 10 + Math.min(leftMovie.popularity / 10, 12);
  const rightScore = rightMovie.rating * 10 + Math.min(rightMovie.popularity / 10, 12);
  const winner = leftScore >= rightScore ? leftMovie.title : rightMovie.title;

  return {
    leftMovie,
    rightMovie,
    winner,
    verdict: `${winner} has the stronger overall edge when balancing rating, popularity, and rewatch recommendation value.`,
    winnerSummary: winner === leftMovie.title
      ? `${leftMovie.title} wins on a stronger blend of score, momentum, and broad audience appeal.`
      : `${rightMovie.title} wins on a stronger blend of score, momentum, and broad audience appeal.`,
    categories: [
      {
        label: 'Rating',
        left: leftMovie.rating.toFixed(1),
        right: rightMovie.rating.toFixed(1),
        winner: leftMovie.rating >= rightMovie.rating ? leftMovie.title : rightMovie.title,
      },
      {
        label: 'Runtime',
        left: leftMovie.runtime ? `${leftMovie.runtime} min` : 'N/A',
        right: rightMovie.runtime ? `${rightMovie.runtime} min` : 'N/A',
        winner: leftMovie.runtime >= rightMovie.runtime ? leftMovie.title : rightMovie.title,
      },
      {
        label: 'Popularity',
        left: Math.round(leftMovie.popularity).toString(),
        right: Math.round(rightMovie.popularity).toString(),
        winner: leftMovie.popularity >= rightMovie.popularity ? leftMovie.title : rightMovie.title,
      },
      {
        label: 'Genres',
        left: leftMovie.genreNames.join(', '),
        right: rightMovie.genreNames.join(', '),
        winner: 'Tie',
      },
      {
        label: 'Budget',
        left: leftMovie.budget ? `$${leftMovie.budget.toLocaleString()}` : 'N/A',
        right: rightMovie.budget ? `$${rightMovie.budget.toLocaleString()}` : 'N/A',
        winner: leftMovie.budget >= rightMovie.budget ? leftMovie.title : rightMovie.title,
      },
      {
        label: 'Revenue',
        left: leftMovie.revenue ? `$${leftMovie.revenue.toLocaleString()}` : 'N/A',
        right: rightMovie.revenue ? `$${rightMovie.revenue.toLocaleString()}` : 'N/A',
        winner: leftMovie.revenue >= rightMovie.revenue ? leftMovie.title : rightMovie.title,
      },
    ],
  };
};
