export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // API proxy to Contexto
    if (url.pathname.startsWith("/api/")) {
      return handleApiProxy(request, url);
    }

    // Serve static assets from the public folder (handled by Wrangler's [site] config)
    // Note: With workers-site or assets, we might need a different handling,
    // but the modern way is using Cloudflare Pages or using `getAssetFromKV` if workers-site.
    // However, Wrangler v3 handles assets natively without worker-site sometimes.
    // Let's explicitly implement a simple proxy for the static assets if needed,
    // or rely on Wrangler's built-in `assets = "public"` feature.
    return new Response("Not found", { status: 404 });
  },
};

async function handleApiProxy(request, url) {
  // Add CORS headers explicitly for options
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
        "Access-Control-Max-Age": "86400",
        "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "",
      }
    });
  }

  // State request to give the frontend the game ID
  if (url.pathname === "/api/state") {
    try {
      // For Contexto, game ID is derived from date.
      // But let's fetch any default word to see if it responds with game id
      // Contexto requires a User-Agent header and sometimes other specific headers
      const sample = await fetch("https://api.contexto.me/machado/en/game/0/cat", {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
      });
      const text = await sample.text();
      let gameId = "1";
      if (sample.ok) {
         try {
           const json = JSON.parse(text);
           if (json.gameId) gameId = json.gameId;
         } catch(e){}
      }
      return new Response(JSON.stringify({ gameId }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch(err) {
      return new Response(JSON.stringify({ gameId: "error" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  }

  // Handle guess specifically: /api/guess?word=cat
  let targetUrl = url.href;
  if (url.pathname === "/api/guess") {
    const word = url.searchParams.get("word");
    // ID 0 often defaults to "today" on Contexto or Machado
    targetUrl = `https://api.contexto.me/machado/en/game/0/${word}`;
  } else {
    // General proxy for other endpoints
    const contextoPath = url.pathname.replace(/^\/api/, "");
    targetUrl = `https://api.contexto.me${contextoPath}${url.search}`;
  }

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });

    // Create a new response to add CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          ...corsHeaders,
          "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "",
        }
      });
    }

    const data = await response.text();
    return new Response(data, {
      status: response.status,
      headers: {
        ...Object.fromEntries(response.headers.entries()),
        ...corsHeaders,
        "content-type": response.headers.get("content-type") || "application/json"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}
