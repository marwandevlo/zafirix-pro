/**

 * Runtime safety: block accidental mock / localStorage persistence in production.

 */



const warnedStores = new Set<string>();



/** Features that use mock, static, or in-memory business data — blocked in production. */

export const ATLAS_DEMO_FEATURE_IDS = [

  'tva_simulation',

  'reports_static_pdf',

  'etude_projet_wizard',

  'client_portal_demo',

] as const;



export type AtlasDemoFeatureId = (typeof ATLAS_DEMO_FEATURE_IDS)[number];



const DEMO_BLOCKED_SET = new Set<string>(ATLAS_DEMO_FEATURE_IDS);



export function isProductionRuntime(): boolean {

  return process.env.NODE_ENV === 'production';

}



/**

 * Browser + production: critical atlas_* data must never be read/written via localStorage.

 * Returns true if the caller must no-op / return empty (defense in depth; primary guard is atlasDataBackend).

 */

export function blockCriticalLocalStorageInProduction(store: string): boolean {

  if (!isProductionRuntime()) return false;

  if (typeof window === 'undefined') return false;

  if (!warnedStores.has(store)) {

    warnedStores.add(store);

    console.warn(

      `[atlas:guard] Blocked localStorage access in production (${store}). Data must use Supabase.`,

    );

  }

  return true;

}



/** True when a demo/mock/static business feature must not render in production. */

export function isDemoFeatureBlocked(featureId: AtlasDemoFeatureId): boolean {

  if (!isProductionRuntime()) return false;

  return DEMO_BLOCKED_SET.has(featureId);

}



export function getDemoFeatureBlockedMessage(_featureId?: AtlasDemoFeatureId): string {

  return 'Fonctionnalité en cours de stabilisation. Cette section sera disponible lorsque le backend et la persistance seront connectés.';

}



/** Guard for pages that seed hardcoded business entities in dev-only local mode. */

export function blockHardcodedBusinessSeedInProduction(context: string): boolean {

  if (!isProductionRuntime()) return false;

  if (typeof window === 'undefined') return false;

  console.warn(`[atlas:guard] Blocked hardcoded seed in production (${context}).`);

  return true;

}


