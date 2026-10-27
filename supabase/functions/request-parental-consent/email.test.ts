import { describe, expect, it } from "vitest";
import { parentConsentRequestEmail } from "./email";

const addUrl = "https://app.dungeongrimoire.com/account/family/add?request=abc-123";

describe("parentConsentRequestEmail", () => {
  it("includes the review link", () => {
    const content = parentConsentRequestEmail({ fromInvite: false, addUrl });
    expect(content.html).toContain(addUrl);
    expect(content.text).toContain(addUrl);
  });

  it("says an invite was involved without naming the campaign", () => {
    const content = parentConsentRequestEmail({ fromInvite: true, addUrl });
    expect(content.html).toContain("invited to join a campaign");
    expect(content.text).toContain("invited to join a campaign");
  });

  it("omits the invite line when there was no invite", () => {
    const content = parentConsentRequestEmail({ fromInvite: false, addUrl });
    expect(content.html).not.toContain("invited to join");
    expect(content.text).not.toContain("invited to join");
  });

  it("escapes the link in the html, so a hostile request token cannot break out of the href", () => {
    const content = parentConsentRequestEmail({ fromInvite: false, addUrl: 'https://x.test/a?request="><script>1</script>' });
    expect(content.html).not.toContain("<script>");
    expect(content.html).toContain("&quot;&gt;&lt;script&gt;");
  });
});
