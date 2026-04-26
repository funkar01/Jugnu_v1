import { iwsdkDev } from "@iwsdk/vite-plugin-dev";
import { compileUIKit } from "@iwsdk/vite-plugin-uikitml";
import { defineConfig, loadEnv } from "vite";
import mkcert from "vite-plugin-mkcert";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
  // 1. CRITICAL: By using a relative base path ('./'), the build will work seamlessly 
  // on both the root Vercel domain AND the /Jugnu_v1/ GitHub Pages subfolder.
  base: './', 

  plugins: [
    mkcert(),
    iwsdkDev({
      emulator: {
        device: "metaQuest3",
      },
      ai: { tools: ["claude"] },
      verbose: true,
    }),

    // 2. Updated for production pathing:
    // This compiles your .uikitml files into JSON. 
    // By placing them in public/ui, Vite will move them to dist/ui during build.
    compileUIKit({ 
      sourceDir: "ui", 
      outputDir: "public/ui", 
      verbose: true 
    }),
  ],

  server: { 
    host: "0.0.0.0", 
    port: 8081, 
    open: true,
    proxy: {
      // Intercept local Vercel API path and forward securely to Gemini using local .env key
      '/api/gemini': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        rewrite: () => `/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`
      }
    }
  },

  build: {
    outDir: "dist",
    // Ensure sourcemaps are off for production to keep the build light
    sourcemap: false, 
    target: "esnext",
    rollupOptions: { 
      input: "./index.html" 
    },
  },

  esbuild: { 
    target: "esnext" 
  },

  optimizeDeps: {
    exclude: ["@babylonjs/havok"],
    esbuildOptions: { target: "esnext" },
  },

  publicDir: "public",
  }; // close return object
}); // close defineConfig