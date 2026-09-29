import { describe, expect, it } from "vitest";
import { escapeHtml, joinRequestEmail, type JoinRequestRole } from "./joinRequestEmail";

const URL = "https://app.example/account/family";
const roles: JoinRequestRole[] = ["joiner", "dm", "both"];

describe("joinRequestEmail", () => {
  it("has a distinct subject and body per role", () => {
    const mails = roles.map((role) => joinRequestEmail({ role, familyUrl: URL }));
    expect(new Set(mails.map((m) => m.subject)).size).toBe(3);
    expect(new Set(mails.map((m) => m.text)).size).toBe(3);
  });

  it("takes nothing but the link as input, so no user text can appear", () => {
    expect(joinRequestEmail.length).toBe(1);
    for (const role of roles) {
      const m = joinRequestEmail({ role, familyUrl: URL });
      expect(m.text).toContain(URL);
      expect(m.html).toContain(`href="${URL}"`);
      expect(m.html).toContain("Open your Family page");
    }
  });

  it("escapes the link in the HTML", () => {
    const m = joinRequestEmail({ role: "joiner", familyUrl: `https://x/"><script>` });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("uses no em-dashes", () => {
    for (const role of roles) {
      const m = joinRequestEmail({ role, familyUrl: URL });
      expect(m.subject + m.html + m.text).not.toContain("—");
    }
  });

  it("escapeHtml handles all five characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});
