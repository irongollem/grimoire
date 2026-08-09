import type { ViewportTransform } from "@vue-flow/core";

const PREFIX = "grimoire:quest-flow-viewport:";

export function readQuestViewport(questId: string, storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): ViewportTransform | null {
  if (!storage) return null;
  try {
    const value = JSON.parse(storage.getItem(`${PREFIX}${questId}`) ?? "null") as Partial<ViewportTransform> | null;
    return value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.zoom) && value.zoom! > 0
      ? { x: value.x!, y: value.y!, zoom: value.zoom! }
      : null;
  } catch {
    return null;
  }
}

export function writeQuestViewport(questId: string, viewport: ViewportTransform, storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage) {
  try {
    storage?.setItem(`${PREFIX}${questId}`, JSON.stringify(viewport));
  } catch {
    // Private browsing and full storage quotas must not break canvas controls.
  }
}
