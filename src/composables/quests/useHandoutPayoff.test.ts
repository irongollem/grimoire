import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const documents = ref<{ id: string; title: string; campaign_id: string | null }[] | undefined>(undefined);
vi.mock("@/composables/scriptorium/useScriptorium", () => ({
  useScriptoriumDocuments: () => ({ data: documents }),
}));

import { useHandoutPayoff } from "./useHandoutPayoff";

describe("useHandoutPayoff", () => {
  it("offers only the quest's own campaign's documents, never account-wide or another campaign's", () => {
    documents.value = [
      { id: "d1", title: "Wanted poster", campaign_id: "camp-a" },
      { id: "d2", title: "Account-wide primer", campaign_id: null },
      { id: "d3", title: "Other table's letter", campaign_id: "camp-b" },
    ];
    const { handoutOptions } = useHandoutPayoff(() => "camp-a");
    expect(handoutOptions.value).toEqual([{ id: "d1", name: "Wanted poster" }]);
  });

  it("names a stored document, and answers null while loading or once it is gone", () => {
    documents.value = undefined;
    const { documentLabel } = useHandoutPayoff(() => "camp-a");
    expect(documentLabel("d1")).toBeNull();
    documents.value = [{ id: "d1", title: "Wanted poster", campaign_id: "camp-a" }];
    expect(documentLabel("d1")).toBe("Wanted poster");
    expect(documentLabel("gone")).toBeNull();
    expect(documentLabel(null)).toBeNull();
  });
});
