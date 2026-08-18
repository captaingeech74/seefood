import { createClient } from "@supabase/supabase-js";

/**
 * Claims one of SeeFood's deliberately conservative Google Places requests.
 * Any database/configuration failure denies the external call: the corpus and
 * open map continue working while paid usage remains fail-closed.
 */
export async function claimGooglePlacesDiscoveryRequest(): Promise<boolean> {
  try {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return false;
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await supabase.rpc("claim_google_places_discovery_request");
    if (error) {
      console.error("[google-places-guard] request denied because the usage guard failed");
      return false;
    }
    return data === true;
  } catch {
    console.error("[google-places-guard] request denied because the usage guard was unavailable");
    return false;
  }
}
