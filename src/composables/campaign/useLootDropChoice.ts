import { computed, ref } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useAppUiStore } from "@/stores/ui/app";
import { useIsRuleEnabled } from "@/composables/rules/useOptionalRules";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import type { LootDropChoice } from "@/types/chat.types";


interface LootDropRequest {
  itemLabel: string;
  resolve: (choice: LootDropChoice | null) => void;
}

// Module-level singleton like useConfirm: one question at a time, answered by the
// dialog mounted once in App.vue.
const request = ref<LootDropRequest | null>(null);

export function useLootDropChoice() {
  /** Resolves null when the DM cancels. */
  function ask(itemLabel: string): Promise<LootDropChoice | null> {
    // A second ask while one is open would orphan the first promise forever; cancel it.
    request.value?.resolve(null);
    return new Promise((resolve) => {
      request.value = { itemLabel, resolve };
    });
  }

  function resolve(choice: LootDropChoice | null) {
    request.value?.resolve(choice);
    request.value = null;
  }

  return { ask, request, resolve };
}

/**
 * Whether a drop from this client must first ask the DM. A DM previewing the player
 * view is playing a player: asking them would hand out loot they cannot hand out.
 */
export function useLootDropPolicy() {
  const auth = useAuthStore();
  const appUi = useAppUiStore();
  const ruleOn = useIsRuleEnabled("need_or_greed");
  const asks = computed(() => auth.isDM && !appUi.dmPreviewMode && ruleOn.value);
  return { asks };
}

/** `sendItemDrop`, preceded by the DM's choice when the rule asks for one. */
export function useDropItem() {
  const { sendItemDrop } = useCampaignMessages();
  const { asks } = useLootDropPolicy();
  const { ask } = useLootDropChoice();

  type DropOptions = NonNullable<Parameters<typeof sendItemDrop>[4]>;

  /** Resolves false, having posted nothing, when the DM cancels the prompt. */
  async function dropItem(
    itemName: string,
    itemId: string | null,
    quantity: number,
    rarity: string | null,
    opts?: DropOptions,
  ): Promise<boolean> {
    if (!asks.value) {
      await sendItemDrop(itemName, itemId, quantity, rarity, opts);
      return true;
    }
    const choice = await ask(quantity > 1 ? `${quantity}× ${itemName}` : itemName);
    if (!choice) return false;
    const chosen: DropOptions =
      choice.mode === "give"
        ? { ...opts, giveTo: choice.partyMemberId }
        : { ...opts, rollMode: choice.mode };
    await sendItemDrop(itemName, itemId, quantity, rarity, chosen);
    return true;
  }

  return { dropItem };
}
