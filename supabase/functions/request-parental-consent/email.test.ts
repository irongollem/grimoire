import { describe, expect, it } from "vitest";
import { parentConsentRequestEmail } from "./email";

describe("parentConsentRequestEmail", () => {
  it("mentions the campaign name and includes the add URL when a campaign resolved", () => {
    const content = parentConsentRequestEmail({
      campaignName: "Curse of Strahd",
      addUrl: "https://app.dungeongrimoire.com/account/family/add?request=abc-123",
    });
    expect(content.html).toContain("Curse of Strahd");
    expect(content.html).toContain("https://app.dungeongrimoire.com/account/family/add?request=abc-123");
    expect(content.text).toContain("Curse of Strahd");
    expect(content.text).toContain("https://app.dungeongrimoire.com/account/family/add?request=abc-123");
  });

  it("omits the campaign line entirely when there is no campaign", () => {
    const content = parentConsentRequestEmail({
      campaignName: null,
      addUrl: "https://app.dungeongrimoire.com/account/family/add?request=abc-123",
    });
    expect(content.html).not.toContain("They would join");
    expect(content.text).not.toContain("They would join");
  });

  it("HTML-escapes the campaign name so it cannot inject markup", () => {
    const content = parentConsentRequestEmail({
      campaignName: `<img src=x onerror=alert(1)> & "Friends"`,
      addUrl: "https://app.dungeongrimoire.com/account/family/add?request=abc-123",
    });
    expect(content.html).not.toContain("<img src=x onerror=alert(1)>");
    expect(content.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(content.html).toContain("&amp;");
    expect(content.html).toContain("&quot;Friends&quot;");
  });

  it("never mentions a request token or free text from the requester", () => {
    // The whole point of a fixed template: nothing but the URL and an
    // already-stored campaign name ever reaches this email.
    const content = parentConsentRequestEmail({ campaignName: null, addUrl: "https://app.dungeongrimoire.com/x" });
    expect(content.subject).toBe("A young player asked you to set up a Grimoire account");
  });
});
