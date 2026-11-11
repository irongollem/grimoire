/**
 * Posting a finished Reel to the Grimoire Instagram account, through the
 * Instagram Graph API with a system-user token (Facebook Login for Business).
 *
 * The account is reached through the Dungeon Grimoire Facebook Page it is
 * linked to: `/me/accounts` lists the Page, the Page names its Instagram
 * account. The video goes up by Meta's resumable upload (rupload), so it never
 * has to sit at a public URL first. The API publishes the moment it is called;
 * it has no "post at this time", so timing is whoever runs the command.
 * See https://developers.facebook.com/docs/instagram-platform/content-publishing/
 */

export const GRAPH_VERSION = "v26.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Instagram's caption limits (IG User Media reference). */
export const CAPTION_MAX_CHARS = 2200;
export const CAPTION_MAX_HASHTAGS = 30;
export const CAPTION_MAX_MENTIONS = 20;

/** Every reason Instagram would refuse a caption, or cut it short, before anything is uploaded. Empty means it is fine. */
export function captionProblems(caption: string): string[] {
  const problems: string[] = [];
  if (caption.trim() === "") problems.push("the caption is empty");
  const chars = [...caption].length;
  if (chars > CAPTION_MAX_CHARS) problems.push(`${chars} characters, the limit is ${CAPTION_MAX_CHARS}`);
  const hashtags = caption.match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  if (hashtags > CAPTION_MAX_HASHTAGS) problems.push(`${hashtags} hashtags, the limit is ${CAPTION_MAX_HASHTAGS}`);
  const mentions = caption.match(/(^|\s)@[\p{L}\p{N}._]+/gu)?.length ?? 0;
  if (mentions > CAPTION_MAX_MENTIONS) problems.push(`${mentions} @ tags, the limit is ${CAPTION_MAX_MENTIONS}`);
  // A tag line word without its # is the slip that went out on the first Workshop Reel ("dmtips dndcrafting").
  const lastLine = caption.trimEnd().split("\n").at(-1) ?? "";
  if (lastLine.includes("#")) {
    const bare = lastLine.split(/\s+/).filter((w) => w !== "" && !w.startsWith("#"));
    if (bare.length > 0) problems.push(`the hashtag line has words without a #: ${bare.join(" ")}`);
  }
  return problems;
}

export interface InstagramAccount {
  id: string;
  username: string;
}

async function graph<T>(token: string, path: string, init?: { method?: string; params?: Record<string, string> }): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  const method = init?.method ?? "GET";
  const body = method === "GET" ? undefined : new URLSearchParams(init?.params);
  if (method === "GET") for (const [k, v] of Object.entries(init?.params ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, { method, body, headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json()) as T & { error?: { message: string; code: number; error_subcode?: number } };
  if (!res.ok || json.error) {
    const e = json.error;
    throw new Error(`Instagram API ${method} ${path}: ${e ? `${e.message} (code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""})` : `HTTP ${res.status}`}`);
  }
  return json;
}

/** The one Instagram account the token reaches through a Page. Throws on none or several, rather than guess. */
export async function findAccount(token: string): Promise<InstagramAccount> {
  const pages = await graph<{ data: { name: string; instagram_business_account?: InstagramAccount }[] }>(token, "me/accounts", {
    params: { fields: "name,instagram_business_account{id,username}" },
  });
  const linked = pages.data.flatMap((p) => (p.instagram_business_account ? [p.instagram_business_account] : []));
  if (linked.length === 0) throw new Error("The token sees no Page with a linked Instagram account. Link the account to the Page in Business settings.");
  if (linked.length > 1) throw new Error(`The token reaches ${linked.length} Instagram accounts (${linked.map((a) => a.username).join(", ")}); expected one.`);
  return linked[0];
}

/** Posts left in Instagram's rolling 24-hour publishing limit. */
export async function postsLeft(token: string, igId: string): Promise<{ used: number; total: number }> {
  const res = await graph<{ data: { quota_usage: number; config: { quota_total: number } }[] }>(token, `${igId}/content_publishing_limit`, {
    params: { fields: "config,quota_usage" },
  });
  return { used: res.data[0].quota_usage, total: res.data[0].config.quota_total };
}

/** Follower and post counts for the Socials tab. */
export async function accountSummary(token: string, igId: string): Promise<{ followers: number; posts: number }> {
  const res = await graph<{ followers_count: number; media_count: number }>(token, igId, { params: { fields: "followers_count,media_count" } });
  return { followers: res.followers_count, posts: res.media_count };
}

export interface RecentMedia {
  permalink: string;
  timestamp: string;
  caption: string | null;
  thumbnail: string | null;
  likes: number | null;
  comments: number | null;
}

/** The account's latest posts. A field the API omits stays null rather than becoming a fake zero. */
export async function recentMedia(token: string, igId: string, limit = 12): Promise<RecentMedia[]> {
  const res = await graph<{
    data: {
      caption?: string;
      permalink: string;
      timestamp: string;
      thumbnail_url?: string;
      media_url?: string;
      media_type?: string;
      like_count?: number;
      comments_count?: number;
    }[];
  }>(token, `${igId}/media`, {
    params: { fields: "caption,permalink,timestamp,thumbnail_url,media_url,media_type,like_count,comments_count", limit: String(limit) },
  });
  return res.data.map((m) => ({
    permalink: m.permalink,
    timestamp: m.timestamp,
    caption: m.caption ?? null,
    thumbnail: (m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url) ?? null,
    likes: m.like_count ?? null,
    comments: m.comments_count ?? null,
  }));
}

/** A post's lifetime numbers. Instagram reports totals only, never per day, so views at a given age come from snapshots (stats.ts). */
export interface MediaInsights {
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
  /** Reels only: the average time a play lasted, in milliseconds. */
  avgWatchMs: number | null;
}

/** Needs `instagram_manage_insights` on the token. A metric the API leaves out stays null rather than becoming a fake zero. */
export async function mediaInsights(token: string, mediaId: string, kind: "reel" | "carousel"): Promise<MediaInsights> {
  const metrics = ["views", "reach", "likes", "comments", "shares", "saved", ...(kind === "reel" ? ["ig_reels_avg_watch_time"] : [])];
  const res = await graph<{ data: { name: string; values: { value: number }[] }[] }>(token, `${mediaId}/insights`, {
    params: { metric: metrics.join(",") },
  });
  const value = (name: string) => res.data.find((m) => m.name === name)?.values[0]?.value ?? null;
  return {
    views: value("views"),
    reach: value("reach"),
    likes: value("likes"),
    comments: value("comments"),
    shares: value("shares"),
    saved: value("saved"),
    avgWatchMs: value("ig_reels_avg_watch_time"),
  };
}

/** A Reel's cover: a frame of the video by its offset, or an image of its own at a public URL. */
export type ReelCover = { atMs: number } | { url: string };

/**
 * The Reel container's fields. A cover image goes as `cover_url` and no frame
 * offset: Instagram would take the image anyway, and sending both hides which
 * one the post was meant to have.
 */
export function reelContainerParams(input: { caption: string; cover: ReelCover }): Record<string, string> {
  return {
    media_type: "REELS",
    upload_type: "resumable",
    caption: input.caption,
    share_to_feed: "true",
    ...("url" in input.cover ? { cover_url: input.cover.url } : { thumb_offset: String(Math.round(input.cover.atMs)) }),
  };
}

/** Creates the Reel container, uploads the file into it, and returns the container id once Instagram has processed it. */
export async function uploadReel(
  token: string,
  igId: string,
  input: { video: Uint8Array; caption: string; cover: ReelCover },
  log: (line: string) => void,
): Promise<string> {
  const container = await graph<{ id: string; uri: string }>(token, `${igId}/media`, {
    method: "POST",
    params: reelContainerParams(input),
  });
  log(`container ${container.id}, uploading ${(input.video.byteLength / 1e6).toFixed(1)} MB`);
  // rupload answers "Request processing failed" now and then for a container
  // made moments earlier (the first try of both scheduled Reels, 4 and 5 Nov
  // 2026), and the same bytes go in a little later. So retry into the same
  // container before giving up, and keep the whole answer for the log.
  const waits = [0, 10_000, 30_000, 60_000];
  for (const [attempt, wait] of waits.entries()) {
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const up = await fetch(container.uri, {
      method: "POST",
      headers: { Authorization: `OAuth ${token}`, offset: "0", file_size: String(input.video.byteLength) },
      body: input.video,
    });
    const text = await up.text();
    let upJson: { success?: boolean; message?: string; debug_info?: { message?: string } } = {};
    try {
      upJson = JSON.parse(text) as typeof upJson;
    } catch {
      // Not JSON: the raw text goes into the error below.
    }
    if (up.ok && upJson.success === true) break;
    const why = `${upJson.debug_info?.message ?? upJson.message ?? `HTTP ${up.status}`} (HTTP ${up.status}: ${text.slice(0, 300)})`;
    if (attempt === waits.length - 1) throw new Error(`Upload refused ${waits.length} times: ${why}`);
    log(`upload refused, trying again in ${waits[attempt + 1] / 1000} s: ${why}`);
  }

  // Meta asks for a poll about once a minute for at most five; a 1-minute Reel is usually ready far sooner, so start quicker.
  const deadline = Date.now() + 5 * 60_000;
  for (let wait = 5_000; ; wait = Math.min(wait * 2, 60_000)) {
    const s = await graph<{ status_code: string; status?: string }>(token, container.id, { params: { fields: "status_code,status" } });
    log(`processing: ${s.status_code}`);
    if (s.status_code === "FINISHED") return container.id;
    if (s.status_code !== "IN_PROGRESS") throw new Error(`Instagram could not process the video: ${s.status_code}${s.status ? ` (${s.status})` : ""}`);
    if (Date.now() + wait > deadline) throw new Error(`Still processing after five minutes; container ${container.id} stays valid for 24 hours.`);
    await new Promise((r) => setTimeout(r, wait));
  }
}

/**
 * Builds a carousel from JPEGs at public URLs (Instagram fetches photos itself;
 * only video has a direct upload) and returns the carousel container's id once
 * Instagram has processed it. Every slide is cropped to the first one's shape.
 */
export async function createCarousel(
  token: string,
  igId: string,
  input: { imageUrls: string[]; caption: string },
  log: (line: string) => void,
): Promise<string> {
  const children: string[] = [];
  for (const [i, imageUrl] of input.imageUrls.entries()) {
    const item = await graph<{ id: string }>(token, `${igId}/media`, { method: "POST", params: { image_url: imageUrl, is_carousel_item: "true" } });
    children.push(item.id);
    log(`slide ${i + 1} of ${input.imageUrls.length}: container ${item.id}`);
  }
  const carousel = await graph<{ id: string }>(token, `${igId}/media`, {
    method: "POST",
    params: { media_type: "CAROUSEL", children: children.join(","), caption: input.caption },
  });
  const deadline = Date.now() + 5 * 60_000;
  for (let wait = 3_000; ; wait = Math.min(wait * 2, 60_000)) {
    const s = await graph<{ status_code: string; status?: string }>(token, carousel.id, { params: { fields: "status_code,status" } });
    log(`processing: ${s.status_code}`);
    if (s.status_code === "FINISHED") return carousel.id;
    if (s.status_code !== "IN_PROGRESS") throw new Error(`Instagram could not build the carousel: ${s.status_code}${s.status ? ` (${s.status})` : ""}`);
    if (Date.now() + wait > deadline) throw new Error(`Still processing after five minutes; container ${carousel.id} stays valid for 24 hours.`);
    await new Promise((r) => setTimeout(r, wait));
  }
}

/** Publishes a processed container and returns the post's public link. */
export async function publish(token: string, igId: string, containerId: string): Promise<{ mediaId: string; permalink: string }> {
  const { id } = await graph<{ id: string }>(token, `${igId}/media_publish`, { method: "POST", params: { creation_id: containerId } });
  const { permalink } = await graph<{ permalink: string }>(token, id, { params: { fields: "permalink" } });
  return { mediaId: id, permalink };
}
