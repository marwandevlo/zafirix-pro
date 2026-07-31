/**
 * Unique id per deployment — baked at build time (Vercel commit SHA or deployment id).
 * Next.js already content-hashes JS/CSS under /_next/static; this id busts HTML and PWA shell caches.
 */

export function resolveAppBuildId(): string {
  return (
    process.env.NEXT_PUBLIC_APP_BUILD_ID?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    process.env.APP_BUILD_ID?.trim() ||
    `local-${Date.now()}`
  );
}

export const APP_BUILD_ID = resolveAppBuildId();
