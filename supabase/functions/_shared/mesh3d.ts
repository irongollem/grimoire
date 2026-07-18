/**
 * Meshy image-to-3D provider client (SIMULACRUM_PLAN.md §1). Mirrors the
 * provider-registry spirit of _shared/imageGen.ts, but Meshy is currently the
 * only mesh provider — `provider_config`/`platform-keys.ts` can add others
 * (Tripo/Rodin) later behind this same two-function interface.
 *
 * MOCK MODE — set the MESHY_MOCK=1 secret (or pass apiKey "mock") to bypass
 * the real Meshy API entirely. Required until the Meshy Pro subscription
 * exists (SIMULACRUM_PLAN.md §7 Phase 2 → Phase 4 go-live) and used by tests.
 * Mock tasks resolve immediately to SUCCEEDED with embedded `data:` URL model
 * outputs, so poll-meshy-jobs' download step runs unmodified end-to-end
 * without a live Meshy account.
 */

import type { fetchPlatformKeys } from "./platform-keys.ts";
import type { MeshFormat, MeshyParams, MeshyTaskStatus } from "./simulacrum.ts";

// Single source of truth for these lives in simulacrum.ts (the pure, tested
// module); re-exported here so client-facing importers need only mesh3d.
export type { MeshFormat };
export type MeshTaskStatus = MeshyTaskStatus;

/**
 * The one key-resolution rule for the mesh provider, shared by forge-mini and
 * poll-meshy-jobs so they can never disagree on whether a key "exists":
 * platform key if set, else the mock sentinel when MESHY_MOCK=1, else null.
 */
export async function resolveMeshyKey(
  admin: Parameters<typeof fetchPlatformKeys>[0],
): Promise<string | null> {
  // Dynamic import: platform-keys → vault reads Deno.env at module scope,
  // which would crash this module's Node-side vitest import (mesh3d.test.ts).
  const { fetchPlatformKeys: fetchKeys } = await import("./platform-keys.ts");
  const platformKeys = await fetchKeys(admin, ["meshy"]);
  const mockMode = typeof Deno !== "undefined" && Deno.env.get("MESHY_MOCK") === "1";
  return platformKeys.meshy ?? (mockMode ? "mock" : null);
}

export interface MeshTask {
  id: string;
  status: MeshTaskStatus;
  progress: number;
  modelUrls: Partial<Record<MeshFormat, string>>;
  thumbnailUrl: string | null;
  polycount: number | null;
  error: string | null;
}

export type MeshyTaskParams = MeshyParams;

const MESHY_API = "https://api.meshy.ai/openapi/v1/image-to-3d";

// ── Mock-mode fixtures ───────────────────────────────────────────────────────
// Minimal valid binary glTF (.glb): 12-byte header (magic "glTF", version 2,
// total length) + a JSON chunk (asset/scene/node/mesh/accessors/bufferViews)
// + a BIN chunk holding one triangle's positions + indices. Verified in
// mesh3d.test.ts (magic bytes + version + chunk lengths).
const MOCK_GLB_BASE64 =
  "Z2xURgIAAABMAgAABAIAAEpTT057ImFzc2V0Ijp7InZlcnNpb24iOiIyLjAifSwic2NlbmUiOjAsInNjZW5lcyI6W3sibm9kZXMiOlswXX1dLCJub2RlcyI6W3sibWVzaCI6MH1dLCJtZXNoZXMiOlt7InByaW1pdGl2ZXMiOlt7ImF0dHJpYnV0ZXMiOnsiUE9TSVRJT04iOjB9LCJpbmRpY2VzIjoxfV19XSwiYnVmZmVycyI6W3siYnl0ZUxlbmd0aCI6NDR9XSwiYnVmZmVyVmlld3MiOlt7ImJ1ZmZlciI6MCwiYnl0ZU9mZnNldCI6MCwiYnl0ZUxlbmd0aCI6MzYsInRhcmdldCI6MzQ5NjJ9LHsiYnVmZmVyIjowLCJieXRlT2Zmc2V0IjozNiwiYnl0ZUxlbmd0aCI6NiwidGFyZ2V0IjozNDk2M31dLCJhY2Nlc3NvcnMiOlt7ImJ1ZmZlclZpZXciOjAsImJ5dGVPZmZzZXQiOjAsImNvbXBvbmVudFR5cGUiOjUxMjYsImNvdW50IjozLCJ0eXBlIjoiVkVDMyIsIm1heCI6WzEsMSwwXSwibWluIjpbMCwwLDBdfSx7ImJ1ZmZlclZpZXciOjEsImJ5dGVPZmZzZXQiOjAsImNvbXBvbmVudFR5cGUiOjUxMjMsImNvdW50IjozLCJ0eXBlIjoiU0NBTEFSIn1dfSAsAAAAQklOAAAAAAAAAAAAAAAAAAAAgD8AAAAAAAAAAAAAAAAAAIA/AAAAAAAAAQACAAAA";
// Minimal valid binary STL: 80-byte header + a 4-byte little-endian triangle
// count of 0 (84 bytes total). A zero-triangle STL is structurally valid,
// if empty — good enough for the mock lifecycle (poll-meshy-jobs never
// inspects triangle data, only downloads and stores the bytes).
const MOCK_STL_BASE64 =
  "R3JpbW9pcmUgbW9jayBTVEwgLSBTaW11bGFjcnVtIG1lc2gzZCBtb2NrIG1vZGUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
// 1×1 pixel WebP, used as the mock task thumbnail.
const MOCK_THUMB_DATA_URL = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";

// usdz/3mf/obj have no lightweight synthetic fixture worth hand-rolling for a
// mock; reuse the GLB bytes under the requested mime type — good enough to
// exercise the download→upload pipeline, which never parses these formats.
const MOCK_MODEL_DATA_URLS: Record<MeshFormat, string> = {
  glb: `data:model/gltf-binary;base64,${MOCK_GLB_BASE64}`,
  stl: `data:model/stl;base64,${MOCK_STL_BASE64}`,
  usdz: `data:model/vnd.usdz+zip;base64,${MOCK_GLB_BASE64}`,
  "3mf": `data:model/3mf;base64,${MOCK_GLB_BASE64}`,
  obj: `data:text/plain;base64,${MOCK_GLB_BASE64}`,
};

// Remembers each mock task's requested target_formats so getImageTo3dTask only
// returns the formats that were actually asked for at create time.
const mockTaskFormats = new Map<string, MeshFormat[]>();

function isMockMode(apiKey: string): boolean {
  // `Deno` is a Deno-only ambient global; guard it so this module — shared
  // into vitest's Node runtime via mesh3d.test.ts — never crashes.
  const envFlag = typeof Deno !== "undefined" ? Deno.env.get("MESHY_MOCK") === "1" : false;
  return envFlag || apiKey === "mock";
}

function mockCreate(params: MeshyTaskParams): string {
  const id = `mock-${crypto.randomUUID()}`;
  mockTaskFormats.set(id, params.target_formats);
  return id;
}

function mockGet(taskId: string): MeshTask {
  const formats = mockTaskFormats.get(taskId) ?? ["glb"];
  const modelUrls: MeshTask["modelUrls"] = {};
  for (const format of formats) modelUrls[format] = MOCK_MODEL_DATA_URLS[format];
  return {
    id: taskId,
    status: "SUCCEEDED",
    progress: 100,
    modelUrls,
    thumbnailUrl: MOCK_THUMB_DATA_URL,
    polycount: 128,
    error: null,
  };
}

// ── Real Meshy API ───────────────────────────────────────────────────────────

export async function createImageTo3dTask(
  apiKey: string,
  imageUrl: string,
  params: MeshyTaskParams,
): Promise<string> {
  if (isMockMode(apiKey)) return mockCreate(params);

  const res = await fetch(MESHY_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ image_url: imageUrl, ...params }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Meshy image-to-3d create error ${res.status}`);
  }
  const data = await res.json();
  // Meshy wraps the created id as { result: "<id>" }; tolerate a bare id too.
  const id = typeof data === "string" ? data : (data?.result ?? data?.id);
  if (!id) throw new Error("Meshy image-to-3d create returned no task id");
  return id as string;
}

export async function getImageTo3dTask(apiKey: string, taskId: string): Promise<MeshTask> {
  if (isMockMode(apiKey)) return mockGet(taskId);

  const res = await fetch(`${MESHY_API}/${taskId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Meshy image-to-3d get error ${res.status}`);
  }
  const data = await res.json();
  return {
    id: data.id ?? taskId,
    status: data.status,
    progress: typeof data.progress === "number" ? data.progress : 0,
    modelUrls: data.model_urls ?? {},
    thumbnailUrl: data.thumbnail_url ?? null,
    polycount: typeof data.polycount === "number" ? data.polycount : null,
    error: data.task_error?.message ?? null,
  };
}
