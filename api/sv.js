export const config = {
  runtime: 'edge',
};

let cachedSession = null;
let sessionExpiry = 0;

function getCorsHeaders(request) {
  const origin = request.headers.get('origin') || '*';
  return {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,OPTIONS,POST',
    'Access-Control-Allow-Headers': 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  };
}

async function getSession(apiKey) {
  const now = Date.now() / 1000;
  if (cachedSession && now < sessionExpiry - 3600) {
    return cachedSession;
  }

  console.log("[SV-Proxy-Edge] Requesting new Google Maps Street View session...");
  const res = await fetch(`https://tile.googleapis.com/v1/createSession?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapType: 'streetview', language: 'en-US', region: 'US' }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Maps createSession failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  cachedSession = data.session;
  sessionExpiry = parseInt(data.expiry, 10);
  console.log(`[SV-Proxy-Edge] Cached session created. Expiry: ${new Date(sessionExpiry * 1000).toISOString()}`);
  return cachedSession;
}

export default async function handler(request) {
  const corsHeaders = getCorsHeaders(request);

  // Handle preflight CORS request
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GOOGLE_MAPS_API_KEY environment variable is not configured on the Vercel server.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  try {
    // ── 1. GET /api/sv/session ─────────────────────────────────────────────
    if (path === '/api/sv/session') {
      if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
      }
      const session = await getSession(apiKey);
      return new Response(JSON.stringify({ session }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 2. POST /api/sv/panoid ─────────────────────────────────────────────
    if (path === '/api/sv/panoid') {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
      }
      
      const { lat, lng } = await request.json();
      console.log(`[SV-Proxy-Edge] Resolving panoId for lat: ${lat}, lng: ${lng}`);

      const session = await getSession(apiKey);
      const upstreamRes = await fetch(
        `https://tile.googleapis.com/v1/streetview/panoIds?session=${session}&key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locations: [{ lat, lng }], radius: 50 }),
        }
      );

      const data = await upstreamRes.json();
      if (!upstreamRes.ok || !data.panoIds?.length) {
        console.warn(`[SV-Proxy-Edge] No panorama found at location: ${lat}, ${lng}`);
        return new Response(JSON.stringify({ error: 'No panorama found', detail: data }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ panoId: data.panoIds[0] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ── 3. GET /api/sv/tile/{z}/{x}/{y}?panoId=... ────────────────────────
    const tileMatch = path.match(/^\/api\/sv\/tile\/(\d+)\/(\d+)\/(\d+)$/);
    if (tileMatch) {
      if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
      }

      const [, z, x, y] = tileMatch;
      const panoId = url.searchParams.get('panoId');

      if (!panoId) {
        return new Response(JSON.stringify({ error: 'Missing panoId parameter' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const session = await getSession(apiKey);
      const tileUrl = `https://tile.googleapis.com/v1/streetview/tiles/${z}/${x}/${y}?session=${session}&panoId=${encodeURIComponent(panoId)}&key=${apiKey}`;
      
      const tileRes = await fetch(tileUrl);
      if (!tileRes.ok) {
        const errText = await tileRes.text();
        return new Response(errText, { status: tileRes.status, headers: corsHeaders });
      }

      const tileBytes = await tileRes.arrayBuffer();
      return new Response(tileBytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }

    // Default 404
    return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Edge function exception:', error);
    return new Response(JSON.stringify({ error: 'Internal server proxy error', message: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
