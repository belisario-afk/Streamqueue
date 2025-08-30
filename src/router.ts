// Hash router for potential future views; here we only need to ensure /callback resolves via 404 fallback.
export function currentRoute() {
  const hash = location.hash || "";
  if (hash.startsWith("#/")) return hash.slice(1);
  return "/";
}