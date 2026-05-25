import { iwsdkDev } from "@iwsdk/vite-plugin-dev";
import { compileUIKit } from "@iwsdk/vite-plugin-uikitml";
import { defineConfig, loadEnv } from "vite";
import mkcert from "vite-plugin-mkcert";
import type { Plugin } from "vite";

// ── Street View Server-Side Proxy Plugin ────────────────────────────────────
// All requests to tile.googleapis.com are made server-side (key never exposed).
// Session token is cached in memory (valid ~2 weeks) to avoid repeated POSTs.
function streetViewProxyPlugin(apiKey: string): Plugin {
  let cachedSession: string | null = null;
  let sessionExpiry = 0;

  async function getSession(): Promise<string> {
    const now = Date.now() / 1000;
    if (cachedSession && now < sessionExpiry - 3600) {
      return cachedSession;
    }
    console.log("[SV-Proxy] Creating new Street View session token...");
    const res = await fetch(
      `https://tile.googleapis.com/v1/createSession?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapType: "streetview", language: "en-US", region: "US" }),
      }
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`createSession failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as { session: string; expiry: string };
    cachedSession = data.session;
    sessionExpiry = parseInt(data.expiry, 10);
    console.log(`[SV-Proxy] Session created. Expires: ${new Date(sessionExpiry * 1000).toISOString()}`);
    return cachedSession;
  }

  return {
    name: "streetview-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next();

        // ── GET /api/sv/session ─────────────────────────────────────────────
        if (req.url === "/api/sv/session") {
          console.log(`[SV-Proxy] GET /api/sv/session`);
          try {
            const session = await getSession();
            res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
            res.end(JSON.stringify({ session }));
          } catch (e: any) {
            console.error(`[SV-Proxy] GET /api/sv/session failed:`, e.message);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: e.message }));
          }
          return;
        }

        // ── POST /api/sv/panoid ─────────────────────────────────────────────
        if (req.url === "/api/sv/panoid" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
          req.on("end", async () => {
            try {
              const { lat, lng } = JSON.parse(body);
              console.log(`[SV-Proxy] POST /api/sv/panoid - lat: ${lat}, lng: ${lng}`);
              const session = await getSession();
              const upstreamRes = await fetch(
                `https://tile.googleapis.com/v1/streetview/panoIds?session=${session}&key=${apiKey}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ locations: [{ lat, lng }], radius: 50 }),
                }
              );
              const data = await upstreamRes.json() as { panoIds?: string[]; error?: unknown };
              if (!upstreamRes.ok || !data.panoIds?.length) {
                console.warn(`[SV-Proxy] No panoId resolved for ${lat}, ${lng}. Status: ${upstreamRes.status}. Data:`, JSON.stringify(data));
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "No panorama found", detail: data }));
                return;
              }
              console.log(`[SV-Proxy] Resolved panoId: ${data.panoIds[0]}`);
              res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
              res.end(JSON.stringify({ panoId: data.panoIds[0] }));
            } catch (e: any) {
              console.error(`[SV-Proxy] POST /api/sv/panoid failed:`, e.message);
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          return;
        }

        // ── GET /api/sv/tile/{z}/{x}/{y}?panoId=... ────────────────────────
        const tileMatch = req.url.match(/^\/api\/sv\/tile\/(\d+)\/(\d+)\/(\d+)\?(.*)$/);
        if (tileMatch) {
          try {
            const [, z, x, y, qs] = tileMatch;
            const params = new URLSearchParams(qs);
            const panoId = params.get("panoId");
            console.log(`[SV-Proxy] GET tile ${z}/${x}/${y} - panoId: ${panoId}`);
            if (!panoId) {
              console.warn(`[SV-Proxy] Missing panoId for tile request`);
              res.writeHead(400); res.end("Missing panoId"); return;
            }
            const session = await getSession();
            const tileUrl = `https://tile.googleapis.com/v1/streetview/tiles/${z}/${x}/${y}?session=${session}&panoId=${panoId}&key=${apiKey}`;
            const tileRes = await fetch(tileUrl);
            if (!tileRes.ok) {
              const errText = await tileRes.text();
              console.error(`[SV-Proxy] Upstream tile fetch failed. Status: ${tileRes.status}. Error:`, errText);
              res.writeHead(tileRes.status);
              res.end(errText);
              return;
            }
            const buffer = Buffer.from(await tileRes.arrayBuffer());
            res.writeHead(200, {
              "Content-Type": "image/jpeg",
              "Content-Length": buffer.length,
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "public, max-age=86400",
            });
            res.end(buffer);
          } catch (e: any) {
            console.error(`[SV-Proxy] Tile endpoint exception:`, e.message);
            res.writeHead(500);
            res.end(e.message);
          }
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const mapsKey = env.GOOGLE_MAPS_API_KEY;

  return {
    base: './',

    plugins: [
      mkcert(),
      iwsdkDev({
        emulator: { device: "metaQuest3" },
        ai: { tools: ["claude"] },
        verbose: true,
      }),
      compileUIKit({
        sourceDir: "ui",
        outputDir: "public/ui",
        verbose: true
      }),
      // Street View server-side proxy — keeps API key off the client
      streetViewProxyPlugin(mapsKey),
    ],

    server: {
      host: "0.0.0.0",
      port: 8081,
      open: true,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      },
      proxy: {
        // Keep Gemini proxy
        '/api/gemini': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          rewrite: () => `/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`
        },
      }
    },

    build: {
      outDir: "dist",
      sourcemap: false,
      target: "esnext",
      rollupOptions: { input: "./index.html" },
    },

    esbuild: { target: "esnext" },

    optimizeDeps: {
      exclude: ["@babylonjs/havok"],
      esbuildOptions: { target: "esnext" },
    },

    publicDir: "public",
  };
});