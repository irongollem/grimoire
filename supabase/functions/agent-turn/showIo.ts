// What the narrator's `show` tool reads and writes (#1021): the campaign's handouts, its pictures, and the handing
// over of a handout. Everything here runs as the caller (the campaign's Dungeon Master), so the database decides
// what they may read and share; nothing is read with the service role.
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_HANDOUTS_SHOWN, pictureUrl, type HandoutOffer, type PictureOf } from "../_shared/agent/show.ts";
import { UUID_RE } from "../_shared/agent/parse.ts";


const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

/** The campaign's handouts the played character does not hold yet, by title. One more than is shown, so "and more" can be said. */
export async function loadHandouts(client: SupabaseClient, campaignId: string, memberId: string): Promise<HandoutOffer[]> {
  const { data, error } = await client
    .from("scriptorium_documents")
    .select("id, title, player_visible_to")
    .eq("campaign_id", campaignId)
    .eq("kind", "handout")
    .order("title", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? [])
    .filter((row) => !strings(row.player_visible_to).includes(memberId))
    .slice(0, MAX_HANDOUTS_SHOWN + 1)
    .map((row) => ({ id: row.id as string, title: typeof row.title === "string" && row.title.trim() !== "" ? row.title.trim() : "An untitled handout" }));
}

/**
 * Hands a handout to the played character. `share_handout` sets who holds it, so the character is added to those
 * who already do: handing one over at the table never takes it from another player.
 */
export async function giveHandout(client: SupabaseClient, campaignId: string, handoutId: string, memberId: string): Promise<void> {
  const found = await client.from("scriptorium_documents").select("player_visible_to").eq("id", handoutId).eq("campaign_id", campaignId).eq("kind", "handout").maybeSingle();
  if (found.error) throw found.error;
  if (!found.data) throw new Error("the handout is no longer in this campaign");
  const holders = strings(found.data.player_visible_to);
  if (holders.includes(memberId)) return;
  const { error } = await client.rpc("share_handout", { p_document_id: handoutId, p_party_member_ids: [...holders, memberId] });
  if (error) throw error;
}

/**
 * The campaign's own picture of a record and the name it is shown under. A character still in disguise is shown as
 * the disguise, or not at all: the true face is never shown before the reveal. An item or a creature may be a
 * shared library record (a text id). Null when there is no such record here or it has no picture.
 */
export async function loadPicture(client: SupabaseClient, campaignId: string, what: PictureOf, id: string): Promise<{ title: string; url: string } | null> {
  const picture = (title: unknown, raw: unknown): { title: string; url: string } | null => {
    const url = pictureUrl(raw);
    return url !== null && typeof title === "string" && title.trim() !== "" ? { title: title.trim(), url } : null;
  };
  if (what === "person") {
    const { data, error } = await client.from("npcs").select("name, portrait_url, disguise_name, disguise_portrait_url, is_revealed").eq("id", id).eq("campaign_id", campaignId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const disguised = typeof data.disguise_name === "string" && data.disguise_name.trim() !== "" && data.is_revealed !== true;
    return disguised ? picture(data.disguise_name, data.disguise_portrait_url) : picture(data.name, data.portrait_url);
  }
  if (what === "place") {
    const { data, error } = await client.from("locations").select("name, image_url").eq("id", id).eq("campaign_id", campaignId).maybeSingle();
    if (error) throw error;
    return data ? picture(data.name, data.image_url) : null;
  }
  const own = UUID_RE.test(id);
  if (what === "item") {
    const { data, error } = own
      ? await client.from("items").select("name, image_url").eq("id", id).eq("campaign_id", campaignId).maybeSingle()
      : await client.from("library_items").select("name, image_url").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? picture(data.name, data.image_url) : null;
  }
  const { data, error } = own
    ? await client.from("monsters").select("name, image_url").eq("id", id).eq("campaign_id", campaignId).maybeSingle()
    : await client.from("library_monsters").select("name, image_url").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? picture(data.name, data.image_url) : null;
}
