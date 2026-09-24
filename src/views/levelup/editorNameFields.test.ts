import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Both editors gate Save on a non-empty name. The name inputs sat beside the
// old hand-rolled Save button, and the PageHeader refactor (47f7f349) removed
// them together with it — leaving `canSave` requiring a field nothing could
// fill, so no custom class or archetype could be created for five months.
// Mounting these views needs half the query layer, and what broke was markup,
// so the guard reads the markup.
const source = (file: string) => readFileSync(resolve(__dirname, file), "utf8");

describe("custom class editors can name what they save", () => {
  it("binds an input to the class name", () => {
    const sfc = source("CustomClassEditorView.vue");
    expect(sfc).toContain('canSave = computed(() => form.value.class_name.trim() !== ""');
    expect(sfc).toMatch(/<AppInput\s+v-model="form\.class_name"/);
  });

  it("binds an input to the archetype name", () => {
    const sfc = source("CustomSubclassEditorView.vue");
    expect(sfc).toContain('form.value.subclass_name.trim() !== ""');
    expect(sfc).toMatch(/<AppInput\s+v-model="form\.subclass_name"/);
  });
});
