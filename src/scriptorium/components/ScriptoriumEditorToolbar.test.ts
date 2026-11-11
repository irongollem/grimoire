// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import ScriptoriumEditorToolbar from "./ScriptoriumEditorToolbar.vue";
import { useScriptoriumUiStore } from "@/scriptorium/stores/ui";

beforeEach(() => setActivePinia(createPinia()));

describe("ScriptoriumEditorToolbar", () => {
  // Fails on: the button doing nothing because the toolbar does not own the rail.
  it("From the campaign opens the kit tab and asks for its search", async () => {
    const ui = useScriptoriumUiStore();
    const editorStub = { isActive: () => false, can: () => ({ undo: () => false, redo: () => false }) };
    const wrapper = mount(ScriptoriumEditorToolbar, { props: { editor: editorStub as never } });
    expect(ui.scriptoriumRailTab).toBe("chapters");
    await wrapper.find("[data-testid=from-campaign]").trigger("click");
    expect(ui.scriptoriumRailTab).toBe("kit");
    expect(ui.scriptoriumCampaignSearchAsked).toBe(1);
    await wrapper.find("[data-testid=from-campaign]").trigger("click");
    expect(ui.scriptoriumCampaignSearchAsked).toBe(2);
  });
});
