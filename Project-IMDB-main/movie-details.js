const urlParams = new URLSearchParams(window.location.search);
const movieId = urlParams.get('id');
const mediaType = urlParams.get('type') || 'movie';
const loadAiInsightsButton = document.getElementById('loadAiInsights');
const aiInsightContent = document.getElementById('aiInsightContent');

async function fetchMovieDetails() {
    if (!movieId) {
        window.location.href = '/';
        return;
    }

    try {
        const response = await fetch(`/api/movie/${movieId}?type=${mediaType}`);
        const movie = await response.json();
        
        displayMovieDetails(movie);
    } catch (error) {
        console.error('Error fetching movie details:', error);
        document.getElementById('movieTitle').textContent = 'Error loading movie details';
    }
}

function displayMovieDetails(movie) {
    document.title = `${movie.title} - TMDB`;
    
    const movieHeader = document.getElementById('movieHeader');
    if (movie.backdrop) {
        movieHeader.style.backgroundImage = `url(${movie.backdrop})`;
    }
    
    document.getElementById('moviePoster').src = movie.poster || 'https://via.placeholder.com/300x450/1a1a1a/ffffff?text=No+Poster';
    document.getElementById('movieTitle').textContent = movie.title;
    
    if (movie.tagline) {
        document.getElementById('movieTagline').textContent = `"${movie.tagline}"`;
    }
    
    const releaseYear = movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A';
    document.getElementById('releaseDate').innerHTML = `<i class="bi bi-calendar-event"></i> ${releaseYear}`;
    
    if (movie.runtime) {
        const hours = Math.floor(movie.runtime / 60);
        const minutes = movie.runtime % 60;
        document.getElementById('runtime').innerHTML = `<i class="bi bi-clock"></i> ${hours}h ${minutes}m`;
    }
    
    document.getElementById('rating').innerHTML = `<i class="bi bi-star-fill"></i> ${movie.rating.toFixed(1)} (${movie.vote_count.toLocaleString()} votes)`;
    
    const genresContainer = document.getElementById('genres');
    if (movie.genres && movie.genres.length > 0) {
        genresContainer.innerHTML = movie.genres.map(genre => 
            `<span class="genre-tag">${genre.name}</span>`
        ).join('');
    }
    
    document.getElementById('overview').textContent = movie.overview || 'No overview available.';
    

function buildCardElementForDetails(movie) {
    const id = movie.id;
    const name = movie.name || movie.title || 'Untitled';
    const imdb = Number(movie.imdb || movie.rating || 0);
    const date = movie.date || movie.year || (movie.releaseDate ? movie.releaseDate.split('-')[0] : 'N/A');
    const sposter = movie.sposter || movie.poster || '';
    const bposter = movie.bposter || movie.backdrop || '';
    const genre = movie.genre || (movie.genreNames && movie.genreNames[0]) || 'Movie';

    const card = document.createElement('a');
    card.classList.add('card');
    card.href = `/movie-details.html?id=${id}&type=${movie.mediaType || movie.media_type || 'movie'}`;
    card.innerHTML = `
        <img src="${sposter}" alt="${name}">
        <div class="cont">
            <h3>${name}</h3>
            <p>${genre}, ${date}, <span>TMDB </span><i class="bi bi-star-fill"></i> ${imdb.toFixed(1)}</p>
        </div>
    `;

    return card;
}

async function loadAiRecommendedSimilar() {
    if (!movieId) return;
    const container = document.getElementById('ai_recommended_similar');
    if (!container) return;
    container.innerHTML = '<p>Loading AI recommendations...</p>';

    try {
        const response = await fetch(`/api/movie/${movieId}/ai-similar?type=${mediaType}`);
        if (!response.ok) throw new Error('Failed to load AI similar');
        const payload = await response.json();
        const recs = payload.recommendations || payload || [];
        container.innerHTML = '';
        if (!recs.length) {
            container.innerHTML = '<p>No AI similar movies were found.</p>';
            return;
        }

        recs.forEach(m => container.appendChild(buildCardElementForDetails(m)));
    } catch (err) {
        console.error('AI similar error:', err);
        container.innerHTML = '<p>Unable to load AI recommendations right now.</p>';
    }
}

    displayCast(movie.cast);
    displayCrew(movie.crew);
    displayReviews(movie.reviews);

    // record opened movie locally for personalization (best-effort)
    try {
        const key = 'ai_user_data_v1';
        const existing = JSON.parse(localStorage.getItem(key) || '{}');
        existing.opened = existing.opened || [];
        existing.opened.unshift({ id: movie.id, title: movie.title, genres: movie.genreNames || [] });
        existing.opened = existing.opened.slice(0, 50);
        existing.genres = Array.from(new Set((existing.genres || []).concat(movie.genreNames || [])));
        localStorage.setItem(key, JSON.stringify(existing));
    } catch (err) {
        // ignore
    }

    // load AI recommended similar movies
    loadAiRecommendedSimilar();
}

function displayCast(cast) {
    const castContainer = document.getElementById('cast');
    
    if (!cast || cast.length === 0) {
        castContainer.innerHTML = '<div class="no-data">No cast information available</div>';
        return;
    }
    
    castContainer.innerHTML = cast.map(person => `
        <div class="cast-card">
            <img src="${person.profile || 'https://via.placeholder.com/150x200/1a1a1a/ffffff?text=' + person.name.charAt(0)}" alt="${person.name}">
            <div class="name">${person.name}</div>
            <div class="character">${person.character || 'Unknown'}</div>
        </div>
    `).join('');
}

function displayCrew(crew) {
    const crewContainer = document.getElementById('crew');
    
    if (!crew || crew.length === 0) {
        crewContainer.innerHTML = '<div class="no-data">No crew information available</div>';
        return;
    }
    
    crewContainer.innerHTML = crew.map(person => `
        <div class="crew-card">
            <img src="${person.profile || 'https://via.placeholder.com/60x60/1a1a1a/ffffff?text=' + person.name.charAt(0)}" alt="${person.name}">
            <div class="crew-info">
                <div class="name">${person.name}</div>
                <div class="job">${person.job}</div>
            </div>
        </div>
    `).join('');
}

function displayReviews(reviews) {
    const reviewsContainer = document.getElementById('reviews');
    
    if (!reviews || reviews.length === 0) {
        reviewsContainer.innerHTML = '<div class="no-data">No reviews available</div>';
        return;
    }
    
    reviewsContainer.innerHTML = reviews.map(review => {
        const content = review.content.length > 500 
            ? review.content.substring(0, 500) + '...' 
            : review.content;
        
        const date = new Date(review.created_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        return `
            <div class="review-card">
                <div class="review-header">
                    <div>
                        <div class="review-author">${review.author}</div>
                        <div style="font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 5px;">${date}</div>
                    </div>
                    ${review.rating ? `<div class="review-rating"><i class="bi bi-star-fill"></i> ${review.rating}/10</div>` : ''}
                </div>
                <div class="review-content">${content}</div>
            </div>
        `;
    }).join('');
}

async function loadAiInsights() {
    if (!movieId) {
        return;
    }

    aiInsightContent.innerHTML = '<p>Generating AI insight...</p>';

    try {
        const response = await fetch(`/api/movie/${movieId}/ai-insights?type=${mediaType}`);
        if (!response.ok) {
            throw new Error('Failed to load AI insights');
        }

        const insights = await response.json();
        aiInsightContent.innerHTML = `
            <h3>${insights.recommendationScore}% Match Score</h3>
            <p>${insights.summary}</p>
            <strong>Strengths</strong>
            <ul>${(insights.strengths || []).map(item => `<li>${item}</li>`).join('')}</ul>
            <strong>Who Should Watch</strong>
            <ul>${(insights.whoShouldWatch || []).map(item => `<li>${item}</li>`).join('')}</ul>
        `;
    } catch (error) {
        console.error('AI insights error:', error);
        aiInsightContent.innerHTML = '<p>Unable to generate AI insight right now.</p>';
    }
}

if (loadAiInsightsButton) {
    loadAiInsightsButton.addEventListener('click', loadAiInsights);
}

fetchMovieDetails();
