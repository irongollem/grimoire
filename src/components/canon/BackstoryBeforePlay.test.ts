import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { PartyMember } from "@/types/party.types";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/composables/party/useParty", () => ({ useUpdatePartyMember: () => ({ mutateAsync: mocks.update }) }));

import BackstoryBeforePlay from "./BackstoryBeforePlay.vue";

const member = (text: string | null) => ({ id: "m1", name: "Tansy", player_description: text }) as unknown as PartyMember;
const Editor = { name: "RichTextEditor", props: ["modelValue"], emits: ["update:modelValue"], template: "<div data-testid='editor' />" };
const mountIt = (text: string | null, editable: boolean) =>
  mount(BackstoryBeforePlay, { props: { member: member(text), editable }, global: { stubs: { RichTextEditor: Editor, RichTextViewer: true } } });

describe("BackstoryBeforePlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.update.mockReset();
    mocks.update.mockResolvedValue({});
  });

  // Bug caught: the field edited here saved nowhere (or into a copy), so the character's own Backstory never changed.
  it("saves an edit to the character's own Backstory field through the party member update", async () => {
    const w = mountIt("old", true);
    w.findComponent({ name: "RichTextEditor" }).vm.$emit("update:modelValue", "new text");
    await vi.advanceTimersByTimeAsync(11_000);
    expect(mocks.update).toHaveBeenCalledWith({ id: "m1", update: { player_description: "new text" } });
  });

  // Bug caught: a read-only view still drawing an editor.
  it("draws no editor when not editable", () => {
    expect(mountIt("text", false).findComponent({ name: "RichTextEditor" }).exists()).toBe(false);
  });
});
