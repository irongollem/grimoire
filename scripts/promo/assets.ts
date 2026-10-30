/**
 * The production CDN serves every storage bucket at `<cdn>/<bucket>/<path>`.
 * The local stack has no library sound files (only their rows), so a sound the
 * filmed page played from local storage is fetched from the CDN instead.
 */
const ASSET_CDN = process.env.PROMO_ASSET_CDN ?? "https://cdn.dungeongrimoire.com";
const LOCAL_STORAGE = /^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/storage\/v1\/object\/public\//;

export function publicAssetUrl(src: string, cdn = ASSET_CDN): string {
  return src.replace(LOCAL_STORAGE, `${cdn}/`);
}
