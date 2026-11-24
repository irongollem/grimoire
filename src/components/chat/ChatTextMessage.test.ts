import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ isDM: false }) }));
vi.mock("@/composables/useLowArt", () => ({ useLowArt: () => ({ lowArt: { value: false } }) }));
vi.mock("@/components/common/media/FocalImage.vue", () => ({ default: { props: ["src"], template: '<img data-testid="portrait" :src="src" />' } }));

import ChatTextMessage from "./ChatTextMessage.vue";
import { readNpcSpeech } from "@/lib/chat/npcSpeech";

const speech = (meta: Record<string, unknown>) => readNpcSpeech({ for_npc_id: "n1", ...meta }, true);

const base = { senderName: "Old Tam", message: "Move along.", renderedMessage: "Move along.", timeLabel: "10:02" };

describe("ChatTextMessage NPC speech (#1270)", () => {
  // Bug caught: an NPC's line drawn as a plain bubble, with no face, once the metadata names the NPC.
  it("draws a line whose metadata names an NPC as that NPC's bubble, with its face", () => {
    const w = mount(ChatTextMessage, { props: { ...base, npcSpeech: speech({ speaker_portrait_url: "http://localhost:54321/tam.webp", ai: true }) } });
    expect(w.find("[data-testid=chat-npc-speech]").exists()).toBe(true);
    expect(w.get("[data-testid=npc-speech-name]").text()).toBe("Old Tam");
    expect(w.get("[data-testid=portrait]").attributes("src")).toBe("http://localhost:54321/tam.webp");
    expect(w.find("[data-testid=npc-speech-ai]").exists()).toBe(true);
    expect(w.text()).toContain("Move along.");
  });

  // Bug caught: a bad address in the message drawn as the picture, instead of the initial.
  it("falls back to the initial for a portrait address that is bad", () => {
    const w = mount(ChatTextMessage, { props: { ...base, npcSpeech: speech({ speaker_portrait_url: "javascript:alert(1)" }) } });
    expect(w.find("[data-testid=portrait]").exists()).toBe(false);
    expect(w.get("[data-testid=npc-speech-initial]").text()).toBe("O");
  });

  // Bug caught: the NPC bubble dropping the whisper label and the "addressed" ring the plain bubble carries.
  it("keeps the whisper recipient and the addressed ring on an NPC's bubble", () => {
    const w = mount(ChatTextMessage, { props: { ...base, npcSpeech: speech({}), recipientName: "Mira", addressed: true } });
    expect(w.get("[data-testid=npc-speech-recipient]").text()).toContain("Mira");
    expect(w.get("[data-testid=chat-npc-speech]").classes()).toContain("ring-2");
    const plain = mount(ChatTextMessage, { props: { ...base, npcSpeech: speech({}) } });
    expect(plain.find("[data-testid=npc-speech-recipient]").exists()).toBe(false);
    expect(plain.get("[data-testid=chat-npc-speech]").classes()).not.toContain("ring-2");
  });

  // Bug caught: every chat line becoming a speech bubble.
  it("leaves an ordinary line as the plain bubble", () => {
    const w = mount(ChatTextMessage, { props: base });
    expect(w.find("[data-testid=chat-npc-speech]").exists()).toBe(false);
  });
});
