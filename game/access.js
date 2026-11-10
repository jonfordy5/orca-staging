import { selectSupabaseConfig } from '../orca-staging-config.js';

// The public staging route never interprets query parameters or localStorage as
// contributor entitlements. The only developer bypass is an actual loopback host.
export function isLocalDevelopment(hostname) {
  return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(String(hostname).toLowerCase());
}
export function validateContributorEvidence(input = {}) {
  const { profile, tasks, findings, ownerId } = input || {};
  if (typeof profile?.id !== 'string' || !profile.id || profile.opted_in !== true || !Array.isArray(tasks) || !Array.isArray(findings)) return false;
  // Accepted ORCA missions assign the display alias, not the profile UUID.
  // A matching alias alone is insufficient: require this owner's publication.
  const assignees = new Set([profile.id, profile.display_name].filter(value => typeof value === 'string' && value.trim()));
  const completed = new Set(tasks.filter(task => (
    task?.status === 'completed' && task.id && assignees.has(task.assigned_agent)
    && (!ownerId || !task.claimed_owner_id || task.claimed_owner_id === ownerId)
  )).map(task => task.id));
  return findings.some(finding => {
    if (!finding || !completed.has(finding.task_id) || !String(finding.summary || '').startsWith('[ORCA-R4;')) return false;
    if (ownerId && finding.contributor_id !== ownerId) return false;
    const published = Date.parse(finding.published_at);
    if (!Number.isFinite(published) || published > Date.now() + 300000 || !Array.isArray(finding.source_urls)) return false;
    return finding.source_urls.some(source => { try { return new URL(source).protocol === 'https:'; } catch { return false; } });
  });
}

// Legacy fixture validation above is not an authorization decision. Public
// eligibility comes exclusively from the current-user database RPC below.
let client;
async function getAccessClient() {
  const { projectUrl, publishableKey } = await selectSupabaseConfig();
  if (!window.supabase?.createClient) throw new Error('Account library unavailable');
  // Same project/default storage key and browser session behavior as account.html.
  client ||= window.supabase.createClient(projectUrl, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
const denied = (status, message) => ({ allowed: false, localDemo: false, status, message });
const safeCode = error => /^[A-Z0-9_]{3,20}$/.test(String(error?.code || '')) ? String(error.code) : 'UNAVAILABLE';

export async function verifyContributorAccess(accountClient) {
  let identity;
  try {
    // Server-verified identity, never local user_metadata or an entitlement flag.
    const { data, error } = await accountClient.auth.getUser();
    if (error?.name === 'AuthSessionMissingError' || (!error && !data?.user)) {
      return denied('signed_out', 'Sign in to your staging account that owns the published research. You will return to The Vault for an automatic eligibility check.');
    }
    if (error) {
      if ([400, 401, 403].includes(error.status)) return denied('session_expired', 'Your staging sign-in has expired. Sign in again to restore access to your existing contribution; no new assignment is needed.');
      return denied('auth_failed', 'The account service could not verify your sign-in. Check your connection and recheck eligibility. Your published research is unchanged.');
    }
    identity = data.user;
  } catch {
    return denied('auth_failed', 'The account service could not verify your sign-in. Check your connection and recheck eligibility. Your published research is unchanged.');
  }
  if (!identity?.id) return denied('signed_out', 'Sign in to your staging account that owns the published research. You will return to The Vault for an automatic eligibility check.');
  try {
    // No owner/alias argument: Postgres derives the caller from the verified JWT.
    // Private contributor_id never needs to be selected by a browser.
    const { data, error } = await accountClient.rpc('orca_legends_access');
    if (error) return denied('query_failed', `Your sign-in was recognized, but the contributor verification service failed (eligibility: ${safeCode(error)}). Recheck or report this code; do not repeat your research mission.`);
    if (data?.allowed === true && data.status === 'eligible') {
      return { allowed: true, localDemo: false, status: 'eligible', ticker: data.ticker, message: 'Your completed, published research contribution is recognized. The Vault is unlocked. This staging game uses demonstration loot; no active assistant session is implied.' };
    }
    const messages = {
      signed_out: 'Sign in to your staging account that owns the published research. You will return to The Vault for an automatic eligibility check.',
      profile_required: 'This account has no owner-bound researcher profile. Check that you signed in to the account used for your completed mission, or open the existing assistant setup.',
      permission_required: 'Research permission is off for this account. Enable it in the existing team controls, then recheck. Your completed mission remains recorded.',
      contribution_required: 'No accepted, completed research publication was found for this account. If you already published, check that this is the account that owns it; do not repeat the mission to troubleshoot access.',
    };
    if (data?.allowed === false && messages[data.status]) return denied(data.status, messages[data.status]);
    return denied('query_failed', 'Your sign-in was recognized, but the eligibility service returned an unexpected response. Recheck eligibility; your research is unchanged.');
  } catch {
    return denied('query_failed', 'Your sign-in was recognized, but the contributor verification service could not be reached. Recheck eligibility; do not repeat your research mission.');
  }
}

export async function checkContributorAccess(hostname = location.hostname) {
  if (isLocalDevelopment(hostname)) return { allowed: true, localDemo: true, status: 'local_demo', message: 'LOCAL DEVELOPER TEST — contribution gate bypassed only on localhost. Demonstration loot; no research calls.' };
  try { return await verifyContributorAccess(await getAccessClient()); }
  catch { return denied('library_unavailable', 'The account library could not load. Reload the Vault and recheck eligibility. Your existing research is unchanged.'); }
}

export async function subscribeContributorAuth(callback) {
  if (isLocalDevelopment(location.hostname)) return () => {};
  const accountClient = await getAccessClient();
  let timer;
  const { data } = accountClient.auth.onAuthStateChange(event => {
    if (!['SIGNED_IN', 'SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) return;
    // Leave the SDK's auth lock before making any further auth/RPC requests.
    clearTimeout(timer); timer = setTimeout(() => callback(event), 0);
  });
  return () => { clearTimeout(timer); data.subscription.unsubscribe(); };
}
