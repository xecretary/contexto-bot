import { DiscordSDK } from "https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@1.2.0/+esm";

// Initialize the SDK using the client ID of the Discord App
// In production, you would fetch this from your worker/env, or hardcode your specific Client ID
// But for now we just prepare the SDK
let discordSdk;

// Only init Discord if we are running in an iframe (likely Discord Activity)
if (window.parent !== window) {
  // Replace with actual Discord Client ID when deploying
  const clientId = "YOUR_DISCORD_CLIENT_ID";
  discordSdk = new DiscordSDK(clientId);

  discordSdk.ready().then(() => {
    console.log("Discord SDK is ready!");
  }).catch(console.error);
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("guess-form");
  const input = document.getElementById("guess-input");
  const guessesContainer = document.getElementById("guesses-container");
  const guessCountEl = document.getElementById("guess-count");
  const gameIdEl = document.getElementById("game-id");

  let guesses = [];
  let currentLanguage = 'en'; // can be modified later based on user settings
  let gameId = null;

  // Fetch the current game number when the app loads
  fetchTodaysGameId();

  async function fetchTodaysGameId() {
    try {
      const res = await fetch('/api/state');
      if (res.ok) {
        const data = await res.json();
        // Just arbitrarily using a value since we don't have the Contexto logic
        // But the real API gives game ID per word guess, or from a state endpoint.
        // I will assume we fetch the ID from /api/state
        gameId = data.gameId || '#??';
        gameIdEl.textContent = `#${gameId}`;
      } else {
        gameIdEl.textContent = `#1262`; // Fallback to a static number for visuals
      }
    } catch (err) {
      console.error("Failed to fetch game state", err);
      gameIdEl.textContent = `#1262`;
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const word = input.value.trim().toLowerCase();

    if (!word) return;

    // Check if already guessed
    if (guesses.some(g => g.word === word)) {
      input.value = "";
      alert("Already guessed!");
      return;
    }

    input.value = "";
    input.disabled = true;

    try {
      const response = await fetchGuess(word);
      if (response && response.distance !== undefined) {

        // Fix for response: Contexto API returns `distance` directly from /machado/en/game/...
        // If it doesn't, we need to adapt. Assuming distance is returned.
        const distance = response.distance !== undefined ? response.distance : (response.distance === 0 ? 0 : 9999);

        guesses.push({
          word: response.word || word,
          distance: distance,
          isNew: true
        });

        // Sort: lowest distance first
        guesses.sort((a, b) => a.distance - b.distance);

        renderGuesses();
      } else {
        console.warn("Invalid response format:", response);
        alert("Word not found!");
      }
    } catch (err) {
      console.error(err);
      alert("Error checking word.");
    } finally {
      input.disabled = false;
      input.focus();
    }
  });

  async function fetchGuess(word) {
    // Current Contexto API usually routes like: GET /machado/{lang}/game/{game_id}/{word}
    // But since we want to play "today's game" without knowing the ID, we might need
    // to proxy to /machado/{lang}/game/{word} if the API supports it,
    // or fetch the current game ID first. Let's assume the API proxy will handle it
    // or we fetch "current" game state first.
    // For now, let's proxy a request: /api/machado/en/game/current/word?
    // Looking at the PHP code, gameId was retrieved via Misc::getTodaysGameId().
    // We will update the proxy later to support this.

    // In original code: $gameId = Misc::getTodaysGameId($session['settings']['language']);
    // And then GET /machado/$language/game/$gameId/$word
    // Let's implement getting the current game ID in the proxy and using it.

    // Request our worker proxy for the specific word guessing using Machado API via Proxy
    // /machado/en/game/{gameId}/{word}
    // But since we want the proxy to handle it, we'll hit /api/guess with word
    const res = await fetch(`/api/guess?word=${encodeURIComponent(word)}`);
    if (!res.ok) {
      if (res.status === 404 || res.status === 400) {
        return null; // word not found
      }
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const text = await res.text();
    console.log("Response text:", text);
    try {
      const data = JSON.parse(text);
      return data;
    } catch(e) {
       console.error("Failed to parse response as JSON", text);
       return null;
    }
  }

  function renderGuesses() {
    guessCountEl.textContent = guesses.length;
    guessesContainer.innerHTML = "";

    guesses.forEach(guess => {
      const row = document.createElement("div");
      row.className = `guess-row ${guess.isNew ? 'new' : ''}`;

      // Calculate bar width (max distance in Contexto is usually ~100,000+ words, but distance max displayed is up to 15000)
      // For width, distance 0 = 100%, higher distance = smaller width.
      // E.g. distance 1000 = 10% width? We can use a logarithmic scale.
      const maxDist = 10000;
      let widthPercent = Math.max(0, 100 - (guess.distance / maxDist * 100));
      if (widthPercent < 2) widthPercent = 2; // minimum width

      // Determine color
      let colorClass = "color-red";
      if (guess.distance === 0) colorClass = "color-green"; // exact match
      else if (guess.distance <= 300) colorClass = "color-green";
      else if (guess.distance <= 1000) colorClass = "color-yellow";
      else if (guess.distance <= 3000) colorClass = "color-orange";

      // If exact match
      if (guess.distance === 0) {
          widthPercent = 100;
      }

      row.innerHTML = `
        <div class="guess-bar ${colorClass}" style="width: ${widthPercent}%"></div>
        <div class="guess-content">
          <span class="guess-word">${guess.word}</span>
          <span class="guess-distance">${guess.distance}</span>
        </div>
      `;

      guessesContainer.appendChild(row);
      guess.isNew = false;
    });
  }
});