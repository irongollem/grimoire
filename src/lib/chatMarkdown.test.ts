// @vitest-environment jsdom
// DOMPurify needs a spec-complete DOM; happy-dom (the repo default) makes it
// strip ALL tags, so this file runs under jsdom — which matches real-browser
// behaviour, the only place these sinks actually render.
import { describe, it, expect } from "vitest";
import { renderChatMessage } from "./chatMarkdown";

describe("renderChatMessage", () => {
  it("strips event-handler attributes from chat HTML (stored XSS guard)", () => {
    const out = renderChatMessage('<img src=x onerror="alert(1)">');
    // DOMPurify may keep a bare <img>, but the executable handler must be gone.
    expect(out).not.toMatch(/onerror/i);
    expect(out).not.toMatch(/\son\w+=/i);
  });

  it("removes <script> from chat content", () => {
    const out = renderChatMessage("<script>alert(document.cookie)</script>");
    expect(out.toLowerCase()).not.toContain("<script");
    expect(out).not.toContain("alert(document.cookie)");
  });

  it("still renders inline markdown formatting", () => {
    expect(renderChatMessage("**bold**")).toContain("<strong>bold</strong>");
    expect(renderChatMessage("*em*")).toContain("<em>em</em>");
  });
});
