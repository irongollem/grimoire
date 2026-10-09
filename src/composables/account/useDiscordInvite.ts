import { computed } from "vue";
import { useAuthStore } from "@/stores/auth";
import { DISCORD_URL } from "@/lib/marketing";

/**
 * The invite to the community Discord, and whether this account may see it.
 *
 * Never shown to a parent-managed child account: Discord's own minimum age is
 * 13, higher in parts of the EU, and an open server is a place a child's
 * parent never agreed to. It fails closed, so the invite stays hidden until
 * the child lookup has confirmed "not a child" (`childLinkLoaded`), rather
 * than flashing for a child while that lookup is still in flight.
 */
export function useDiscordInvite() {
  const auth = useAuthStore();
  const visible = computed(() => auth.childLinkLoaded && !auth.isChildAccount);
  return { url: DISCORD_URL, visible };
}
