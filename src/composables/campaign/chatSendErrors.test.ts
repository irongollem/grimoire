import { describe, expect, it, vi, beforeEach } from "vitest";

const { reportHandledError } = vi.hoisted(() => ({ reportHandledError: vi.fn() }));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError }));

import { PostgrestError } from "@supabase/supabase-js";
import { chatFailureMessage, sendFailureMessage, useChatSendFailure } from "./chatSendErrors";
import { useToast } from "@/composables/useToast";

describe("chatSendErrors", () => {
  beforeEach(() => {
    reportHandledError.mockClear();
    const { toasts, dismiss } = useToast();
    for (const t of toasts.value) dismiss(t.id);
  });

  it("words the failure around what did not happen", () => {
    expect(chatFailureMessage("post the roll to the chat")).toBe(
      "Couldn't post the roll to the chat. Please try again.",
    );
  });

  it("toasts and reports to Sentry", () => {
    const err = new Error("boom");
    useChatSendFailure().reportChatFailure(err, "send the item");
    const { toasts } = useToast();
    expect(toasts.value).toHaveLength(1);
    expect(toasts.value[0]).toMatchObject({ type: "error", message: "Couldn't send the item. Please try again." });
    expect(reportHandledError).toHaveBeenCalledWith(err, "campaign-chat-send", { what: "send the item" });
  });
  it("explains a refused whisper without reporting it: the rule working is not a fault", () => {
    const refused = new PostgrestError({ message: "row-level security", details: "", hint: "", code: "42501" });
    useChatSendFailure().reportMessageFailure(refused, true);
    const { toasts } = useToast();
    expect(toasts.value[0]).toMatchObject({ type: "error", message: "Message not sent. You can't whisper that player privately." });
    expect(reportHandledError).not.toHaveBeenCalled();
  });

  it("reports any other failed message", () => {
    const err = new Error("network");
    useChatSendFailure().reportMessageFailure(err, true);
    expect(reportHandledError).toHaveBeenCalledWith(err, "campaign-chat-send", { what: "message" });
  });
});

describe("sendFailureMessage", () => {
  const rls = () =>
    new PostgrestError({
      message: 'new row violates row-level security policy for table "campaign_messages"',
      details: "",
      hint: "",
      code: "42501",
    });

  it("names a refused whisper", () => {
    expect(sendFailureMessage(rls(), true)).toMatch(/can't whisper/);
  });

  it("falls back to a generic message otherwise", () => {
    expect(sendFailureMessage(new Error("network"), true)).toBe("Message not sent. Please try again.");
    expect(sendFailureMessage(rls(), false)).toBe("Message not sent. Please try again.");
  });
});
