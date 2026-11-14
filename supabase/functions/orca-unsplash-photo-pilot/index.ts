import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { isVerifiedOrcaBrowserToken } from "../_shared/orca-browser-token.ts";
// Read-only, three-event Unsplash preview. No database changes or secret disclosure.
const origin = "https://jonfordy5.github.io";
// Pilot photo preview uses a paid third-party quota. A linked read-only AI
// must never spend that quota using a website-only bearer.
const supabaseAuth=createClient(Deno.env.get("SUPABASE_URL")||"",Deno.env.get("SUPABASE_ANON_KEY")||"",{
  auth:{persistSession:false,autoRefreshToken:false}
});
const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "private, max-age=120"
};
const terms: Record<string,string> = {
  "ulta-ipo": "beauty cosmetics retail shelves",
  "ulta-target": "cosmetics display beauty retail store",
  "ulta-space-nk": "luxury beauty skincare store shelves"
};
Deno.serve(async (request: Request) => {
  if(request.method === "OPTIONS") return new Response(null,{status:204,headers});
  if(request.method !== "GET") return new Response(JSON.stringify({error:"GET only"}),{status:405,headers});
  const raw=request.headers.get("Authorization")||"";
  const token=/^Bearer\s+(\S+)$/i.exec(raw)?.[1]||"";
  if(token.split(".").length!==3)return new Response(JSON.stringify({error:"Sign in to preview photos"}),{status:401,headers});
  const checked=await supabaseAuth.auth.getUser(token);
  const user=checked.data?.user,authError=checked.error;
  if(authError||!user)return new Response(JSON.stringify({error:"Session expired"}),{status:401,headers});
  if(!isVerifiedOrcaBrowserToken(token,user.id))return new Response(JSON.stringify({error:"Linked AI clients cannot use this photo preview"}),{status:403,headers});
  const event = new URL(request.url).searchParams.get("event") || "";
  if(!Object.hasOwn(terms,event)) return new Response(JSON.stringify({error:"Unknown pilot event"}),{status:400,headers});
  const key = Deno.env.get("UNSPLASH_ACCESS_KEY");
  if(!key) return new Response(JSON.stringify({error:"Unsplash Access Key not configured"}),{status:503,headers});
  const query = new URL("https://api.unsplash.com/search/photos");
  query.searchParams.set("query",terms[event]);
  query.searchParams.set("per_page","3");
  query.searchParams.set("orientation","landscape");
  query.searchParams.set("content_filter","high");
  try {
    const upstream = await fetch(query.toString(),{
      headers:{"Authorization":"Client-ID "+key,"Accept-Version":"v1"},
      signal:AbortSignal.timeout(9000)
    });
    if(!upstream.ok) return new Response(JSON.stringify({error:"Photo search unavailable",code:upstream.status}),{status:502,headers});
    const data = await upstream.json();
    const photos = (data.results || []).slice(0,3).map((p: any) => ({
      id: p.id,
      image_url: p.urls?.small,
      photo_url: p.links?.html,
      photographer: p.user?.name,
      photographer_url: p.user?.links?.html,
      image_credit: "Photo by "+(p.user?.name || "photographer")+" on Unsplash",
      illustrative: true
    }));
    return new Response(JSON.stringify({event,photos,note:"Illustrative only, not historical event photos. No database changes."}),{status:200,headers});
  } catch {
    return new Response(JSON.stringify({error:"Photo search failed"}),{status:502,headers});
  }
});