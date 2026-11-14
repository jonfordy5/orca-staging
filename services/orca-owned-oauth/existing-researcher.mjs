// Supabase stays ORCA's login/account system; this bridge never creates users
// or accepts an alias supplied by an OAuth client as an identity.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function verifyExistingResearcher({
  auth,ownerScopedProfileRead,supabaseBearer
}={}){
  if(!auth||typeof auth.getUser!=='function'||
     typeof ownerScopedProfileRead!=='function'||
     typeof supabaseBearer!=='string'||supabaseBearer.split('.').length!==3)
    throw Error('supabase_identity_unavailable');
  // auth.getUser validates the caller with Supabase Auth. Never derive the
  // user ID from an unsigned/decode-only JWT, email, nickname or form field.
  const verified=await auth.getUser(supabaseBearer);
  const ownerId=verified?.data?.user?.id;
  if(verified?.error||typeof ownerId!=='string'||!uuid.test(ownerId))
    throw Error('supabase_user_not_verified');
  // ownerScopedProfileRead must be an RLS-scoped Supabase user client or a
  // narrowly audited owner-only backend RPC. It is NOT a service-role export.
  const profile=await ownerScopedProfileRead(ownerId,supabaseBearer);
  if(!profile||profile.owner_id!==ownerId||
    profile.opted_in!==true)
    throw Error('existing_orca_profile_or_consent_required');
  return {ownerId,existingResearcher:true};
}
