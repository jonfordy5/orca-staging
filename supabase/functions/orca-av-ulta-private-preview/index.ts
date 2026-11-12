import { isVerifiedOrcaBrowserToken } from "../_shared/orca-browser-token.ts";

import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "https://jonfordy5.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "private, no-store"
};

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return respond(405, { error: "POST required" });
  }

  const token = req.headers
    .get("Authorization")
    ?.match(/^Bearer\s+(\S+)$/i)?.[1];

  if (!token) {
    return respond(401, { error: "ORCA sign-in required" });
  }

  const { data: identity, error: authError } =
    await supabase.auth.getUser(token);

  if (authError || !identity.user) {
    return respond(401, { error: "Invalid ORCA session" });
  }
  if (!isVerifiedOrcaBrowserToken(token, identity.user.id)) {
    return respond(403, { error: "oauth_client_not_allowed_for_site_function" });
  }

  let requestBody: { ticker?: string };

  try {
    requestBody = await req.json();
  } catch {
    return respond(400, { error: "Invalid request" });
  }

  if (requestBody.ticker !== "ULTA") {
    return respond(400, { error: "Private ULTA test only" });
  }

  // Verify researcher authorization and enforce daily limits.
  const { data: reservation, error: reserveError } =
    await supabase.rpc("orca_av_preview_reserve", {
      p_user: identity.user.id,
      p_ticker: "ULTA"
    });

  if (reserveError) {
    return respond(503, { error: "Authorization check failed" });
  }

  if (reservation?.state !== "reserved") {
    return respond(
      reservation?.state === "denied" ? 403 : 429,
      { error: reservation?.state || "Request unavailable" }
    );
  }

  const runId = reservation.run_id;

  async function finish(
    state: string,
    count: number,
    errorCode: string | null
  ) {
    await supabase
      .from("orca_alpha_vantage_dev_requests")
      .update({
        state,
        returned_bars: count,
        error_code: errorCode,
        finished_at: new Date().toISOString()
      })
      .eq("id", runId);
  }

  const apiKey = Deno.env.get("ALPHA_VANTAGE_API_KEY");

  if (!apiKey) {
    await finish("failed", 0, "missing_key");
    return respond(503, { error: "Alpha Vantage secret not found" });
  }

  try {
    // Restore the previously working compact daily-price preview.
    // Keep this private and request-bound; never disclose the provider API key.
    const endpoint = new URL("https://www.alphavantage.co/query");
    endpoint.searchParams.set("function", "TIME_SERIES_DAILY");
    endpoint.searchParams.set("outputsize", "compact");
    endpoint.searchParams.set("symbol", "ULTA");
    endpoint.searchParams.set("apikey", apiKey);
    const response = await fetch(endpoint, {signal: AbortSignal.timeout(15000),redirect:"error"});
    if (!response.ok) {
      await finish("failed",0,"provider_error");
      return respond(502,{error:"Historical price provider unavailable"});
    }
    const json = await response.json();
    const monthly = json["Time Series (Daily)"];
    if (!monthly) {
      await finish("failed",0,"no_daily_data");
      return respond(502,{error:"Alpha Vantage did not return daily prices",
        reason: json.Information ? "Provider plan or rate limit" : json.Note ? "Rate limit" : "No daily series"});
    }
    const bars = Object.entries(monthly).map(([time,values])=>{
      const v=values as Record<string,string>;
      return {time,open:Number(v["1. open"]),high:Number(v["2. high"]),
        low:Number(v["3. low"]),close:Number(v["4. close"])};
    }).filter(bar=>/^\\d{4}-\\d{2}-\\d{2}$/.test(bar.time)&&
      [bar.open,bar.high,bar.low,bar.close].every(p=>Number.isFinite(p)&&p>0))
      .filter(bar=>bar.time>="2006-01-01")
      .sort((a,b)=>a.time.localeCompare(b.time));
    await finish("ready",bars.length,null);
    return respond(200,{ticker:"ULTA",source:"Alpha Vantage",interval:"daily",
      bars,notice:"Private development use only; Recent daily prices"});

  } catch {
    await finish("failed", 0, "request_failed");
    return respond(502, { error: "Price request failed" });
  }
});
