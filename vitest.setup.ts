// Next.js loads .env automatically; a standalone vitest run does not, so we
// load it here using Node's built-in loader (no extra dependency needed).
try {
  process.loadEnvFile();
} catch {
  // .env is optional — DATABASE_URL may already be set in the environment.
}
