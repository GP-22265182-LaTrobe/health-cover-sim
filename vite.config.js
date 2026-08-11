// Vite provides the React development server and production build process.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // The React plugin lets Vite understand JSX and refresh changed components.
  plugins: [react()],

  // During development, the browser talks to Vite on port 5173.
  // Vite forwards every /api request to Express on port 3001.
  // The React code can therefore use /api/students without hard-coding a host.
  server: {
    proxy: {
      "/api": "http://127.0.0.1:3001"
    }
  }
});