/**
 * Prints the deployment build id (used by next.config.ts at build time).
 */
const id =
  process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
  process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
  process.env.APP_BUILD_ID?.trim() ||
  `local-${Date.now()}`;

process.stdout.write(id);
