const ORCA_STAGING_ENVIRONMENT = 'orca-staging';
const ORCA_STAGING_PROJECT_REF = 'vbziibatnejoswsdggga';
const ORCA_STAGING_PROJECT_URL = 'https://vbziibatnejoswsdggga.supabase.co';
const ORCA_STAGING_PUBLISHABLE_KEY = 'sb_publishable_vUOZ5qC2FQVsh7MUyEmHQA_j211UdHH';

// Optional Logo.dev browser-safe publishable key (pk_...), never an sk_ secret.
// Leave empty until ORCA owner enables the free Logo.dev account.
export const ORCA_LOGO_DEV_PUBLISHABLE_KEY = 'pk_aZczTnfrSF6UewWF32lrFw';

export function isOrcaStagingEnvironment() {
  return true;
}

export async function selectSupabaseConfig() {
  const projectUrl = new URL(ORCA_STAGING_PROJECT_URL);
  if (
    projectUrl.protocol !== 'https:'
    || projectUrl.hostname !== `${ORCA_STAGING_PROJECT_REF}.supabase.co`
    || !ORCA_STAGING_PUBLISHABLE_KEY.startsWith('sb_publishable_')
  ) {
    throw new Error('ORCA staging configuration is invalid; refusing to connect.');
  }
  return {
    isOrcaStaging: true,
    projectUrl: projectUrl.href.replace(/\/$/, ''),
    publishableKey: ORCA_STAGING_PUBLISHABLE_KEY,
  };
}

export function orcaStagingHref(path, params = {}) {
  const url = new URL(path, window.location.href);
  if (
    url.origin !== window.location.origin
    || !url.pathname.startsWith('/orca-staging/')
  ) {
    throw new Error('ORCA staging links must remain within the staging website.');
  }
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set('environment', ORCA_STAGING_ENVIRONMENT);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function showOrcaStagingIndicator() {
  const indicator = document.getElementById('staging-indicator');
  if (indicator) indicator.hidden = false;
}
