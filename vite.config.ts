import { defineConfig } from "vite";

// Derive base path for GitHub Pages automatically.
// On Pages, the site is served from /<REPO>/. Locally and in non-Pages deploys, base can be "/".
const repoBase = process.env.GITHUB_REPOSITORY
  ? `/${process.env.GITHUB_REPOSITORY.split("/")[1]}/`
  : "/";

export default defineConfig({
  base: repoBase,
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  build: {
    target: "es2022"
  },
  resolve: {
    alias: {
      "@auth": "/src/auth",
      "@spotify": "/src/spotify",
      "@audio": "/src/audio",
      "@visuals": "/src/visuals",
      "@controllers": "/src/controllers",
      "@ui": "/src/ui",
      "@utils": "/src/utils",
      "@recording": "/src/recording"
    }
  }
});