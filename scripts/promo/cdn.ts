/**
 * Putting a file on the asset CDN for Instagram to fetch. The API takes photos
 * (carousel slides, a Reel's cover) only from a public URL, so a post puts them
 * on R2 under `promo/<id>/`, named by their content so a changed file never
 * reuses an old URL, and checks each one loads before handing it over.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { putObject } from "../../supabase/functions/_shared/r2/client.ts";
import { IMMUTABLE_CACHE_CONTROL, r2ConfigFrom } from "../../supabase/functions/_shared/r2/config.ts";

/** `promo/<id>/<first 12 hex of the content's sha256>-<name>`: a new file gets a new key. */
export function promoKey(id: string, bytes: Uint8Array, name: string): string {
  return `promo/${id}/${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}-${name}`;
}

/** Puts a JPEG on the CDN as `name` under the post's folder and returns its public URL, once it loads. */
export async function hostJpeg(id: string, file: string, name: string): Promise<string> {
  const r2 = r2ConfigFrom((k) => process.env[k]);
  const cdn = process.env.ASSET_CDN_URL?.replace(/\/+$/, "");
  if (!r2 || !cdn) throw new Error("R2_* and ASSET_CDN_URL must be set (npm run promo:post loads .env.local).");
  const body = readFileSync(file);
  const key = promoKey(id, body, name);
  await putObject(r2, { key, body, contentType: "image/jpeg", cacheControl: IMMUTABLE_CACHE_CONTROL });
  const url = `${cdn}/${key}`;
  const res = await fetch(url, { method: "HEAD" });
  if (!res.ok) throw new Error(`${url} answers ${res.status} after upload; Instagram could not fetch it.`);
  return url;
}
