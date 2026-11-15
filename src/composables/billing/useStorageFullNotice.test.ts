import { afterEach, describe, expect, it } from "vitest";
import { effectScope } from "vue";
import { notifyStorageFull } from "@/lib/storage/storageFull";
import { useToast } from "@/composables/useToast";
import { useStorageFullNotice } from "./useStorageFullNotice";

afterEach(() => {
  const { toasts, dismiss } = useToast();
  for (const t of toasts.value) dismiss(t.id);
});

describe("useStorageFullNotice", () => {
  it("names pictures for a picture upload and files for anything else, so a .glb is not blamed on pictures", () => {
    const scope = effectScope();
    scope.run(() => useStorageFullNotice());
    const { toasts } = useToast();
    notifyStorageFull("pictures");
    notifyStorageFull("files");
    scope.stop();
    expect(toasts.value.map((t) => /picture/i.test(t.message))).toEqual([true, false]);
    expect(toasts.value.every((t) => t.type === "error")).toBe(true);
  });

  it("stops toasting when its scope ends, so a remounted app does not double the notice", () => {
    const scope = effectScope();
    scope.run(() => useStorageFullNotice());
    scope.stop();
    notifyStorageFull("pictures");
    expect(useToast().toasts.value).toHaveLength(0);
  });
});
