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
});
