import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Use the existing manifest.webmanifest in public/
      manifest: false,
      workbox: {
        // Precache app shell + all assets (images are now WebP, largest ~640KB)
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,webmanifest}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Tiptap editor — loaded on any page with a rich text field
          if (id.includes("node_modules/@tiptap") || id.includes("node_modules/prosemirror")) {
            return "tiptap";
          }
          // PDF/print — only needed in Card Forge
          if (id.includes("node_modules/jspdf") || id.includes("node_modules/html2canvas")) {
            return "pdf";
          }
          // Visualisation — NPC relationship web only
          if (id.includes("node_modules/d3") || id.includes("node_modules/v-network-graph")) {
            return "viz";
          }
          // Supabase client
          if (id.includes("node_modules/@supabase")) {
            return "supabase";
          }
          // UI primitives (radix + vueuse + icons + tw utils)
          if (
            id.includes("node_modules/radix-vue") ||
            id.includes("node_modules/@vueuse") ||
            id.includes("node_modules/lucide-vue-next") ||
            id.includes("node_modules/class-variance-authority") ||
            id.includes("node_modules/clsx") ||
            id.includes("node_modules/tailwind-merge") ||
            id.includes("node_modules/tw-animate-css")
          ) {
            return "ui";
          }
          // Vue ecosystem core
          if (
            id.includes("node_modules/vue") ||
            id.includes("node_modules/vue-router") ||
            id.includes("node_modules/pinia") ||
            id.includes("node_modules/@tanstack")
          ) {
            return "vue-core";
          }
          // Everything else from node_modules
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
      },
    },
  },
});
