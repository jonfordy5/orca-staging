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

let client;
export async function checkContributorAccess(hostname = location.hostname) {
  if (isLocalDevelopment(hostname)) return { allowed: true, localDemo: true, message: 'LOCAL DEVELOPER TEST — contribution gate bypassed only on localhost. Demonstration loot; no research calls.' };
  const denied = message => ({ allowed: false, localDemo: false, message });
  try {
    const { projectUrl, publishableKey } = await selectSupabaseConfig();
    if (!window.supabase?.createClient) return denied('Account library unavailable. Reload and recheck eligibility.');
    client ||= window.supabase.createClient(projectUrl, publishableKey, { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } });
    // getUser verifies the stored session with the Auth server; user-editable
    // metadata and browser-provided eligibility flags are never consulted.
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth?.user) return denied('Sign in to your staging account, authorize your own assistant, and complete a source-backed ORCA mission to unlock this contributor test.');
    const profileResult = await client.from('agent_profiles').select('id,display_name,opted_in').eq('owner_id', auth.user.id).maybeSingle();
    if (profileResult.error) throw profileResult.error;
    const profile = profileResult.data;
    if (!profile || !profile.opted_in) return denied('Your own researcher profile and explicit research permission are required. Use the existing team and assistant setup pages.');
    const assigneeIds = [profile.id, profile.display_name].filter(value => typeof value === 'string' && value.trim());
    const taskResult = await client.from('research_tasks').select('id,status,assigned_agent,claimed_owner_id').in('assigned_agent', assigneeIds).eq('status', 'completed').order('updated_at', { ascending: false }).limit(100);
    if (taskResult.error) throw taskResult.error;
    if (!taskResult.data?.length) return denied('Complete and publish your first accepted personal-agent research mission in the Commons to unlock gameplay.');
    const ids = taskResult.data.map(task => task.id);
    const findingResult = await client.from('commons_research_findings').select('task_id,summary,source_urls,published_at,contributor_id').in('task_id', ids).eq('contributor_id', auth.user.id).order('published_at', { ascending: false }).limit(100);
    if (findingResult.error) throw findingResult.error;
    if (!validateContributorEvidence({ profile, tasks: taskResult.data, findings: findingResult.data, ownerId: auth.user.id })) return denied('A completed assignment with its accepted R4 publication and original source link is required. Public viewing alone does not unlock play.');
    return { allowed: true, localDemo: false, message: 'Contributor eligibility confirmed from your completed, published ORCA mission. This staging game uses demonstration loot. No active assistant session is implied.' };
  } catch {
    // Fail closed without exposing account details, JWTs, or backend errors.
    return denied('Contributor eligibility could not be verified. Existing research is unaffected. Recheck after signing in; access stays locked while account services are unavailable.');
  }
}
