import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode, command }) => {
  // The hub uses ManuQueue's server for accounts, roles and members. Set
  // MANUQUEUE_URL (for example http://localhost:3000) to use a ManuQueue
  // running on this computer instead of the live site
  const manuqueueUrl = (
    loadEnv(mode, ".", "").MANUQUEUE_URL || "https://manuqu.com"
  ).replace(/\/+$/, "");
const scoutingUrl = (
    loadEnv(mode, ".", "").SCOUTING_URL || "https://scouting-2026-e5d76.web.app"
  ).replace(/\/+$/, "");
const toolkitUrl = (
    loadEnv(mode, ".", "").MEMTOOLKIT_URL || "https://lambertrobotics.org"
  ).replace(/\/+$/, "");
  return {
    // Live, ManuQueue serves the hub at manuqu.com/hub/ (built into
    // ../manu-orders/public/hub by `npm run build:manuqueue`), so it shares
    // ManuQueue's sign-in. The dev server stays at the root.
    base: command === "build" ? "/hub/" : "/",
    plugins: [
      react(),
      tailwindcss(),
      {
        // The build swaps each page's script tag for its own and drops
        // blocking="render", which keeps the top bar from blinking out
        // between pages (src/mount.tsx). This puts it back.
        name: "render-blocking-page-script",
        transformIndexHtml: {
          order: "post",
          handler: (html) =>
            html.replace(/<script type="module"(?![^>]*blocking=)/g, '<script type="module" blocking="render"'),
        },
      },
    ],
    define: {
      // For links to ManuQueue, like the top bar's ManuQueue button
      __MANUQUEUE_URL__: JSON.stringify(manuqueueUrl),
      __SCOUTING_URL__: JSON.stringify(scoutingUrl),
      __MEMTOOLKIT_URL__: JSON.stringify(toolkitUrl),
    },
    server: {
      fs: {
        // The binder's list of blocks lives in ManuQueue, which checks pages
        // against it (src/binder/content.ts imports it)
        allow: [".", "../manu-orders/src/lib/binder-blocks.ts"],
      },
      proxy: {
        // The dev server passes these requests on to ManuQueue, so the
        // browser sees them as coming from the hub and keeps ManuQueue's
        // session cookie
        "/api": { target: manuqueueUrl, changeOrigin: true },
      },
    },
    build: {
      // three.js, for the binder's 3D models, is one chunk of about 560 kB
      // (140 kB sent). It loads only on a page with a model on it
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        // Plain pages (home, roles, scouting roster) and ManuQueue styled
        // ones (login, members, settings, edit binder)
        input: {
          main: "index.html",
          login: "login/index.html",
          roles: "roles/index.html",
          members: "members/index.html",
          scoutingRoster: "scouting-roster/index.html",
          settings: "settings/index.html",
          editBinder: "edit-binder/index.html",
        },
      },
    },
  };
});
