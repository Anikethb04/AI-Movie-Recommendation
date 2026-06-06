let left_btn = document.getElementsByClassName('bi-chevron-left')[0];
let right_btn = document.getElementsByClassName('bi-chevron-right')[0];
let cards = document.getElementsByClassName('cards')[0];
let search = document.getElementsByClassName('search')[0];
let search_input = document.getElementById('search_input');
let aiToggle = document.getElementById('ai_toggle');
let aiPanel = document.getElementById('ai_panel');
let aiClose = document.getElementById('ai_close');
let aiForm = document.getElementById('ai_form');
let aiPrompt = document.getElementById('ai_prompt');
let aiMessages = document.getElementById('ai_messages');

// --- Local usage tracking for Personalized Recommendations ---
function recordUserAction(type, payload) {
    try {
        const key = 'ai_user_data_v1';
        const existing = JSON.parse(localStorage.getItem(key) || '{}');
        existing.searches = existing.searches || [];
        existing.opened = existing.opened || [];
        existing.genres = existing.genres || [];

        if (type === 'search') {
            if (payload && payload.query) existing.searches.unshift(payload.query);
            existing.searches = Array.from(new Set(existing.searches)).slice(0, 50);
        }

        if (type === 'open') {
            if (payload && payload.id) existing.opened.unshift({ id: payload.id, title: payload.title || '', genres: payload.genres || [] });
            existing.opened = existing.opened.filter(Boolean).slice(0, 50);
        }

        if (type === 'genres') {
            if (payload && Array.isArray(payload)) {
                existing.genres = existing.genres.concat(payload).filter(Boolean);
                existing.genres = Array.from(new Set(existing.genres)).slice(0, 20);
            }
        }

        localStorage.setItem(key, JSON.stringify(existing));
    } catch (e) {
        // ignore storage errors
    }
}

function readUserPreferences() {
    const key = 'ai_user_data_v1';
    try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        return {
            favoriteGenres: data.genres || [],
            favoriteMovies: (data.opened || []).map(m => m.title).filter(Boolean).slice(0, 10),
            recentSearches: data.searches || []
        };
    } catch (e) {
        return { favoriteGenres: [], favoriteMovies: [], recentSearches: [] };
    }
}

// Global click listener to capture when a user opens a movie details link
document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a');
    if (!anchor) return;
    try {
        const href = anchor.getAttribute('href') || '';
        if (href.includes('movie-details.html')) {
            const url = new URL(anchor.href, window.location.origin);
            const id = url.searchParams.get('id');
            const nameEl = anchor.querySelector('h4, h3');
            const title = nameEl ? nameEl.textContent.trim() : (anchor.dataset && anchor.dataset.name) || '';
            const genreText = anchor.querySelector('.sub p') ? anchor.querySelector('.sub p').textContent : '';
            const genres = genreText ? genreText.split(',').map(s => s.trim()) : [];
            recordUserAction('open', { id, title, genres });
            recordUserAction('genres', genres);
        }
    } catch (err) {
        // ignore
    }
});

// Helper to render a card element using same structure as homepage
function buildCardElement(movie) {
    const id = movie.id;
    const name = movie.name || movie.title || movie.title || 'Untitled';
    const imdb = Number(movie.imdb || movie.rating || movie.vote_average || 0);
    const date = movie.date || movie.year || (movie.releaseDate ? movie.releaseDate.split('-')[0] : 'N/A');
    const sposter = movie.sposter || movie.poster || movie.poster_path || '';
    const bposter = movie.bposter || movie.backdrop || movie.backdrop_path || '';
    const genre = movie.genre || (movie.genreNames && movie.genreNames[0]) || 'Movie';

    const card = document.createElement('a');
    card.classList.add('card');
    card.href = `/movie-details.html?id=${id}&type=${movie.media_type || movie.mediaType || 'movie'}`;
    card.innerHTML = `
        <img src="${sposter}" alt="${name}" class="poster">
        <div class="rest_card">
            <img src="${bposter}" alt="">
            <div class="cont">
                <h4>${name}</h4>
                <div class="sub">
                    <p>${genre}, ${date}</p>
                    <h3><span>TMDB </span><i class="bi bi-star-fill"></i> ${imdb.toFixed(1)}</h3>
                </div>
            </div>
        </div>
    `;

    return card;
}

// Fetch personalized recommendations and render into `#recommended_cards`
async function fetchRecommendedForYou() {
    const container = document.getElementById('recommended_cards');
    if (!container) return;

    const prefs = readUserPreferences();
    if ((!prefs.favoriteGenres || prefs.favoriteGenres.length === 0) && (!prefs.favoriteMovies || prefs.favoriteMovies.length === 0)) {
        // If no meaningful history, hide section
        container.innerHTML = '<p style="color: #fff; padding: 12px;">No recommendations yet — interact with movies to get personalized picks.</p>';
        return;
    }

    container.innerHTML = '<p style="color: #fff; padding: 12px;">Loading recommendations...</p>';

    try {
        const response = await fetch('/api/personalized', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ preferences: prefs })
        });

        if (!response.ok) throw new Error('Failed to fetch personalized recommendations');

        const data = await response.json();
        const recs = data.recommendations || data || [];
        container.innerHTML = '';
        if (recs.length === 0) {
            container.innerHTML = '<p style="color: #fff; padding: 12px;">No recommendations available right now.</p>';
            return;
        }

        recs.forEach(movie => {
            const card = buildCardElement(movie);
            container.appendChild(card);
        });
    } catch (err) {
        console.error('Personalized recommendations error:', err);
        container.innerHTML = '<p style="color: #fff; padding: 12px;">Unable to load recommendations.</p>';
    }
}

// Mood buttons handling
function setupMoodButtons() {
    const buttons = document.querySelectorAll('.mood_btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const prompt = btn.dataset.prompt || btn.textContent || 'recommend movies';
            const resultsContainer = document.getElementById('mood_results');
            resultsContainer.innerHTML = '';

            try {
                const resp = await fetch('/api/ai-recommend', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, limit: 12 })
                });

                if (!resp.ok) throw new Error('AI request failed');
                const payload = await resp.json();
                const recs = payload.recommendations || [];
                if (recs.length === 0) {
                    resultsContainer.innerHTML = '<p style="color: #fff; padding: 12px;">No mood suggestions available.</p>';
                    return;
                }

                recs.forEach(movie => resultsContainer.appendChild(buildCardElement(movie)));
            } catch (err) {
                console.error('Mood AI error', err);
                resultsContainer.innerHTML = '<p style="color: #fff; padding: 12px;">Unable to load mood recommendations.</p>';
            }
        });
    });
}

// Voice recognition for the search box — sends spoken text to AI recommendation endpoint
function setupVoiceMic() {
    const mic = document.getElementById('voice_mic');
    if (!mic) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        mic.style.display = 'none';
        return;
    }

    const recognizer = new SpeechRecognition();
    recognizer.lang = 'en-US';
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;

    mic.addEventListener('click', () => {
        mic.classList.add('listening');
        recognizer.start();
    });

    recognizer.addEventListener('result', (event) => {
        const text = event.results[0][0].transcript;
        mic.classList.remove('listening');
        // send to AI recommendation endpoint and render into search area
        appendAiMessage('user', text);
        fetch('/api/ai-recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: text, limit: 10 })
        }).then(r => r.json()).then(payload => {
            const recs = payload.recommendations || [];
            if (recs.length) {
                // show in search panel
                search.innerHTML = '';
                recs.forEach(movie => {
                    const card = document.createElement('a');
                    card.classList.add('card');
                    card.href = `/movie-details.html?id=${movie.id}&type=${movie.mediaType || movie.media_type || 'movie'}`;
                    card.innerHTML = `
                        <img src="${movie.sposter}" alt="${movie.name || movie.title}">
                        <div class="cont">
                            <h3>${movie.name || movie.title}</h3>
                            <p>${movie.genre || (movie.genreNames && movie.genreNames.join(', ')) || ''}, ${movie.date || movie.year || ''} <span>TMDB </span><i class="bi bi-star-fill"></i> ${Number(movie.imdb || movie.rating || 0).toFixed(1)}</p>
                        </div>
                    `;
                    search.appendChild(card);
                });

                search.style.visibility = "visible";
                search.style.opacity = 1;
            } else {
                appendAiMessage('bot', 'No voice-based recommendations found.');
            }
        }).catch(err => {
            console.error('Voice AI error', err);
            appendAiMessage('bot', 'Voice recommendation failed.');
        });
    });

    recognizer.addEventListener('end', () => mic.classList.remove('listening'));
}

left_btn.addEventListener('click', ()=> {
    cards.scrollLeft -= 140;
})
right_btn.addEventListener('click', ()=> {
    cards.scrollLeft += 140;
})

aiToggle.addEventListener('click', () => {
    aiPanel.classList.toggle('open');
});

aiClose.addEventListener('click', () => {
    aiPanel.classList.remove('open');
});

function appendAiMessage(role, text, recommendations = []) {
    let message = document.createElement('div');
    message.classList.add('ai_message', role === 'user' ? 'ai_message_user' : 'ai_message_bot');

    let recommendationHtml = '';
    if (recommendations.length > 0) {
        recommendationHtml = `
            <div class="ai_recommendation_list">
                ${recommendations.map(movie => `
                    <a class="ai_recommendation_card" href="/movie-details.html?id=${movie.id}&type=${movie.mediaType || movie.media_type || 'movie'}">
                        <img src="${movie.poster || movie.sposter}" alt="${movie.title || movie.name}">
                        <div>
                            <h4>${movie.title || movie.name}</h4>
                            <p>${movie.whyItMatches || movie.overview || 'Strong match based on your prompt.'}</p>
                            <span>${movie.genreNames ? movie.genreNames.join(', ') : movie.genre} • Match ${Math.round(movie.similarityScore || 85)}%</span>
                        </div>
                    </a>
                `).join('')}
            </div>
        `;
    }

    message.innerHTML = `
        <strong>${role === 'user' ? 'You' : 'Cine AI'}</strong>
        <p>${text}</p>
        ${recommendationHtml}
    `;

    aiMessages.appendChild(message);
    aiMessages.scrollTop = aiMessages.scrollHeight;
}

aiForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const prompt = aiPrompt.value.trim();

    if (!prompt) {
        return;
    }

    appendAiMessage('user', prompt);
    aiPrompt.value = '';

    try {
        const response = await fetch('/api/ai-recommend', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt,
                limit: 5
            })
        });

        if (!response.ok) {
            throw new Error('Failed to get AI recommendations');
        }

        const data = await response.json();
        appendAiMessage('bot', 'Here are some recommendations based on your request.', data.recommendations || []);
    } catch (error) {
        console.error('AI recommendation error:', error);
        appendAiMessage('bot', 'Sorry, I could not generate recommendations right now. Please try again.');
    }
});

let trendingMovies = [];
let currentFeaturedIndex = 0;

async function fetchTrendingRegionalMovies() {
    const cachedData = localStorage.getItem('trending_regional');
    const cacheTime = localStorage.getItem('trending_cache_time');
    const now = new Date().getTime();
    
    if (cachedData && cacheTime && (now - cacheTime < 600000)) {
        try {
            const parsed = JSON.parse(cachedData);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        } catch (e) {
            localStorage.removeItem('trending_regional');
            localStorage.removeItem('trending_cache_time');
        }
    }
    
    try {
        const response = await fetch('/api/trending-regional');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        if (Array.isArray(data) && data.length > 0) {
            localStorage.setItem('trending_regional', JSON.stringify(data));
            localStorage.setItem('trending_cache_time', now.toString());
            return data;
        }
        return [];
    } catch (error) {
        console.error('Error fetching trending movies:', error);
        return [];
    }
}

function displayFeaturedMovie(movie) {
    const header = document.querySelector('header');
    header.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.7)), url('${movie.bposter}')`;
    header.style.backgroundSize = 'cover';
    header.style.backgroundPosition = 'center';
    
    document.getElementById('title').innerText = movie.name;
    document.getElementById('gen').innerText = movie.genre;
    document.getElementById('date').innerText = movie.date;
    document.getElementById('rate').innerHTML = `<span>TMDB </span><i class="bi bi-star-fill"></i> ${movie.imdb.toFixed(1)}`;
    
    const contentP = document.querySelector('.content p');
    if (contentP && movie.overview) {
        contentP.innerText = movie.overview;
    }
}

function rotateFeaturedMovie() {
    if (trendingMovies.length === 0) return;
    
    currentFeaturedIndex = Math.floor(Math.random() * trendingMovies.length);
    displayFeaturedMovie(trendingMovies[currentFeaturedIndex]);
}

async function fetchMoviesFromServer() {
    const cachedData = localStorage.getItem('tmdb_movies');
    const cacheTime = localStorage.getItem('tmdb_cache_time');
    const now = new Date().getTime();
    
    if (cachedData && cacheTime && (now - cacheTime < 3600000)) {
        try {
            const parsed = JSON.parse(cachedData);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed;
            }
        } catch (e) {
            localStorage.removeItem('tmdb_movies');
            localStorage.removeItem('tmdb_cache_time');
        }
    }
    
    try {
        const response = await fetch('/api/movies');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        if (Array.isArray(data) && data.length > 0) {
            localStorage.setItem('tmdb_movies', JSON.stringify(data));
            localStorage.setItem('tmdb_cache_time', now.toString());
            return data;
        }
        return [];
    } catch (error) {
        console.error('Error fetching movies:', error);
        localStorage.removeItem('tmdb_movies');
        localStorage.removeItem('tmdb_cache_time');
        return [];
    }
}

fetchTrendingRegionalMovies().then((trending) => {
    trendingMovies = trending;
    if (trendingMovies.length > 0) {
        rotateFeaturedMovie();
        setInterval(rotateFeaturedMovie, 600000);
    }
});

fetchMoviesFromServer().then((data) => {
    if (data.length === 0) {
        console.error('No movies loaded');
        return;
    }

    data.forEach((ele, i) => {
        let{ id, name, imdb, date, sposter, bposter, genre, media_type, overview } = ele;
        let card = document.createElement('a');
        card.classList.add('card');
        card.href = `/movie-details.html?id=${id}&type=${media_type || 'movie'}`;
        card.innerHTML = `
        <img src="${sposter}" alt="${name}" class="poster">
                    <div class="rest_card">
                        <img src="${bposter}" alt="">
                        <div class="cont">
                            <h4>${name}</h4>
                            <div class="sub">
                                <p>${genre}, ${date}</p>
                                <h3><span>TMDB </span><i class="bi bi-star-fill"></i> ${imdb.toFixed(1)}</h3>
                            </div>
                        </div>
                    </div>
        `
        
        card.addEventListener('mouseenter', () => {
            const header = document.querySelector('header');
            header.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.7)), url('${bposter}')`;
            header.style.backgroundSize = 'cover';
            header.style.backgroundPosition = 'center';
            
            document.getElementById('title').innerText = name;
            document.getElementById('gen').innerText = genre;
            document.getElementById('date').innerText = date;
            document.getElementById('rate').innerHTML = `<span>TMDB </span><i class="bi bi-star-fill"></i> ${imdb.toFixed(1)}`;
            
            const contentP = document.querySelector('.content p');
            if (contentP && overview) {
                contentP.innerText = overview;
            }
        });
        
        cards.appendChild(card);
    });

    let searchTimeout;
    let searchResults = [];

    search.style.visibility = "hidden";
    search.style.opacity = 0;

    function renderSearchResults(results) {
        search.innerHTML = '';
        
        if (results.length === 0) {
            search.innerHTML = '<p style="color: #fff; padding: 10px; text-align: center;">No results found</p>';
            return;
        }
        
        results.forEach(movie => {
            let card = document.createElement('a');
            card.classList.add('card');
            card.href = `/movie-details.html?id=${movie.id}&type=${movie.media_type || 'movie'}`;
            card.innerHTML = `
                <img src="${movie.sposter}" alt="${movie.name}">
                <div class="cont">
                    <h3>${movie.name}</h3>
                    <p>${movie.genre}, ${movie.date}, <span>TMDB </span><i class="bi bi-star-fill"></i> ${movie.imdb.toFixed(1)}</p>
                </div>
            `;
            search.appendChild(card);
        });
    }

    async function searchMovies(query) {
        if (!query || query.trim() === '') {
            search.innerHTML = '';
            search.style.visibility = "hidden";
            search.style.opacity = 0;
            return;
        }
        // record search for personalized recommendations
        recordUserAction('search', { query });
        
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            const results = await response.json();
            searchResults = results;
            renderSearchResults(results);
            search.style.visibility = "visible";
            search.style.opacity = 1;
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    search_input.addEventListener('focus', ()=> {
        const query = search_input.value.trim();
        if (query) {
            searchMovies(query);
        }
    });

    search_input.addEventListener('keyup', ()=> {
        clearTimeout(searchTimeout);
        const query = search_input.value.trim();
        
        if (!query) {
            search.innerHTML = '';
            search.style.visibility = "hidden";
            search.style.opacity = 0;
            return;
        }
        
        searchTimeout = setTimeout(() => {
            searchMovies(query);
        }, 300);
    });

    search_input.addEventListener('blur', (e)=> {
        setTimeout(() => {
            if (!search.matches(':hover') && document.activeElement !== search_input) {
                search.style.visibility = "hidden";
                search.style.opacity = 0;
            }
        }, 200);
    });

    search.addEventListener('mouseleave', ()=> {
        if (document.activeElement !== search_input) {
            search.style.visibility = "hidden";
            search.style.opacity = 0;
        }
    });

    let play = document.getElementById('play');
    play.addEventListener('click', (e) => {
        e.preventDefault();
        alert('Movie playback feature - Coming soon!');
    })
    let series = document.getElementById('series');
    let movies = document.getElementById('movies');

    series.addEventListener('click', ()=> {
        cards.innerHTML = '';

        let series_array = data.filter(ele => {
            return ele.type === "series";
        });
        series_array.forEach((ele, i) => {
        let{ id, name, imdb, date, sposter, bposter, genre, media_type, overview } = ele;
        let card = document.createElement('a');
        card.classList.add('card');
        card.href = `/movie-details.html?id=${id}&type=${media_type || 'tv'}`;
        card.innerHTML = `
        <img src="${sposter}" alt="${name}" class="poster">
                    <div class="rest_card">
                        <img src="${bposter}" alt="">
                        <div class="cont">
                            <h4>${name}</h4>
                            <div class="sub">
                                <p>${genre}, ${date}</p>
                                <h3><span>TMDB </span><i class="bi bi-star-fill"></i> ${imdb.toFixed(1)}</h3>
                            </div>
                        </div>
                    </div>
        `
        
        card.addEventListener('mouseenter', () => {
            const header = document.querySelector('header');
            header.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.7)), url('${bposter}')`;
            header.style.backgroundSize = 'cover';
            header.style.backgroundPosition = 'center';
            
            document.getElementById('title').innerText = name;
            document.getElementById('gen').innerText = genre;
            document.getElementById('date').innerText = date;
            document.getElementById('rate').innerHTML = `<span>TMDB </span><i class="bi bi-star-fill"></i> ${imdb.toFixed(1)}`;
            
            const contentP = document.querySelector('.content p');
            if (contentP && overview) {
                contentP.innerText = overview;
            }
        });
        
        cards.appendChild(card);
    });
    })

    movies.addEventListener('click', ()=> {
        cards.innerHTML = '';

        let movie_array = data.filter(ele => {
            return ele.type === "movie";
        });
        
        movie_array.forEach((ele, i) => {
        let{ id, name, imdb, date, sposter, bposter, genre, media_type, overview } = ele;
        let card = document.createElement('a');
        card.classList.add('card');
        card.href = `/movie-details.html?id=${id}&type=${media_type || 'movie'}`;
        card.innerHTML = `
        <img src="${sposter}" alt="${name}" class="poster">
                    <div class="rest_card">
                        <img src="${bposter}" alt="">
                        <div class="cont">
                            <h4>${name}</h4>
                            <div class="sub">
                                <p>${genre}, ${date}</p>
                                <h3><span>TMDB </span><i class="bi bi-star-fill"></i> ${imdb.toFixed(1)}</h3>
                            </div>
                        </div>
                    </div>
        `
        
        card.addEventListener('mouseenter', () => {
            const header = document.querySelector('header');
            header.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.7)), url('${bposter}')`;
            header.style.backgroundSize = 'cover';
            header.style.backgroundPosition = 'center';
            
            document.getElementById('title').innerText = name;
            document.getElementById('gen').innerText = genre;
            document.getElementById('date').innerText = date;
            document.getElementById('rate').innerHTML = `<span>TMDB </span><i class="bi bi-star-fill"></i> ${imdb.toFixed(1)}`;
            
            const contentP = document.querySelector('.content p');
            if (contentP && overview) {
                contentP.innerText = overview;
            }
        });
        
        cards.appendChild(card);
    });

    })

    
});

// Initialize AI UI behaviors
setupMoodButtons();
setupVoiceMic();
fetchRecommendedForYou();
