// GET/POST /api/rsvp — the link in a suggested-session email. Why this relays
// to the session-rsvp Edge Function rather than linking to it: _rsvpRelay.ts.
import { relayRsvp } from "./_rsvpRelay.js"; // .js: package.json is "type": "module", so Node needs the extension at runtime

const supabaseUrl = (): string | undefined => process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;

export function GET(req: Request): Promise<Response> {
  return relayRsvp(req, supabaseUrl());
}

export function POST(req: Request): Promise<Response> {
  return relayRsvp(req, supabaseUrl());
}
