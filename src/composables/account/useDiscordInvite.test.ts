import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

const auth = reactive({ childLinkLoaded: false, isChildAccount: false });
vi.mock("@/stores/auth", () => ({ useAuthStore: () => auth }));

import { useDiscordInvite } from "./useDiscordInvite";
import { MARKETING_URL } from "@/lib/marketing";

beforeEach(() => {
  auth.childLinkLoaded = false;
  auth.isChildAccount = false;
});

describe("useDiscordInvite", () => {
  it("links the marketing site's redirect, not a raw invite", () => {
    expect(useDiscordInvite().url).toBe(`${MARKETING_URL}/discord`);
  });

  it("shows the invite to an account confirmed not to be a child", () => {
    auth.childLinkLoaded = true;
    expect(useDiscordInvite().visible.value).toBe(true);
  });

  it("never shows it to a child account", () => {
    auth.childLinkLoaded = true;
    auth.isChildAccount = true;
    expect(useDiscordInvite().visible.value).toBe(false);
  });

  it("stays hidden while the child lookup has not settled", () => {
    expect(useDiscordInvite().visible.value).toBe(false);
  });
});
