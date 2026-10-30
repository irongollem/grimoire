<template>
  <div class="space-y-4 pb-8">
    <!-- Hit points follow the player down the page once the header's own row is gone. -->
    <PlayerHpStrip
      v-if="member"
      :member="member"
      :wildshape="activeWildshape ?? undefined"
      v-model:height="hpStripHeight"
      :visible="hpRowOutOfSight"
    />
    <!-- No character linked -->
    <div v-if="!member" class="text-center py-16 space-y-4">
      <p class="text-heading text-muted-foreground">No character linked</p>
      <template v-if="appUi.dmPreviewMode">
        <p class="text-body text-muted-foreground italic">Select a character above to preview their sheet.</p>
      </template>
      <template v-else>
        <p class="text-body text-muted-foreground italic">
          Build your own character sheet, or ask your DM to link you to an existing party member.
        </p>
        <AppButton to="/play/character/create" variant="primary" size="md" label="Create Character" />
      </template>
    </div>

    <template v-else>
      <!-- Status banner: shown only for a character seated at the active table; silent when the editions match. -->
      <CharacterEditionNotice
        v-if="campaign.activeCampaign && member.campaign_id === campaign.activeCampaign.id"
        :member="member"
        :campaign="campaign.activeCampaign"
      />
      <CharacterApprovalNotice v-if="member.campaign_id" :member="member" />
      <CharacterCaretakingNotice :member="member" :viewed-by-dm="!!memberId" />
      <MemorialBanner v-if="memorialInEffect" :memorial="memorialInEffect" :viewer="memorialViewer" />
      <!-- The gear in view is the active table's, so only a character seated there can be compared. -->
      <AcCalculatedNotice v-if="campaign.activeCampaign && member.campaign_id === campaign.activeCampaign.id" :member="member" />
      <!-- ── Always visible ─────────────────────────────────── -->
      <!-- One card: the header, closed underneath by the six ability boxes -->
      <div ref="sheetCard" class="rounded-lg border border-border bg-card overflow-hidden">
        <PlayerCharacterHeader
          :member="member"
          :wildshape="activeWildshape ?? undefined"
          :beast-speed="beastMonster?.stat_block?.speed"
          :effective-dex="effectiveScores.dex"
          :hide-player-actions="hidePlayerActions || isMindingThis"
          @level-up="emit('level-up')"
        >
          <template #conditions>
            <PlayerConditions :member="member" @roll="onChildRoll" />
          </template>
        </PlayerCharacterHeader>
        <AbilityScoreTable
          layout="sheet"
          :scores="effectiveScores"
          :saves="saves"
          :roll-mode-picker="true"
          @roll-ability="rollAbility"
          @roll-save="rollSave"
        />
      </div>

      <!-- Tracks (custom + built-in rule trackers) -->
      <PlayerTracksSection
        v-if="resolvedMemberId"
        :member-id="resolvedMemberId"
        :custom-trackers="customTrackers"
      />

      <!-- Shapeshifter appearance controls (only visible to the player themselves) -->
      <PlayerAppearanceSection
        v-if="canShapeshift && member"
        :member="member"
      />

      <!-- ── Tabs + Export Sheet ──────────────────────────── -->
      <!-- The tab row sticks to the top of the sheet's scroller, beneath the hit point strip while that is
           showing, so scrolling never leaves the tabs half under it. It is its own block (a sticky box
           stays inside its parent, and a row shared with the actions would end with them). -->
      <div
        class="sticky z-10 w-fit max-w-full rounded-md bg-card max-sm:w-full"
        :style="{ top: `${hpStripHeight}px` }"
      >
        <!-- On a phone the tabs span the page like the cards around them. -->
        <SegmentedControl
          v-model="activeTab"
          :options="tabOptions"
          variant="ghost"
          size="sm"
          :block="isPhone"
          class="rounded-md border border-border/50 bg-muted/40 p-1"
        />
      </div>
      <div v-if="!hidePlayerActions && !isMindingThis && member" class="flex items-center gap-2 sm:justify-end">
        <AppButton v-if="!appUi.dmPreviewMode" to="/play/champions" variant="subtle" size="sm" class="max-sm:flex-1" label="My Characters" />
        <AppButton :to="{ name: 'play-character-sheet' }" variant="subtle" size="sm" class="max-sm:flex-1" label="Export Sheet" />
        <OverflowMenu
          v-if="ownerMenuItems.length"
          :label="`More actions for ${member.name}`"
          :items="ownerMenuItems"
          @select="onOwnerMenu"
        />
      </div>

      <!-- Skills -->
      <PlayerSkillsTab
        v-if="activeTab === 'skills'"
        :member="member"
        :override-scores="overrideScores"
        :check-disadvantage="checkDisadvantage"
        :check-penalty="exhaustionD20Penalty"
        @roll="onChildRoll"
      />

      <!-- Features -->
      <PlayerFeaturesTab
        v-else-if="activeTab === 'features'"
        :member="member"
        :wildshape-monster="beastMonster ?? undefined"
        :is-owner="isOwner"
        :can-manage="canManage"
      />

      <!-- Combat -->
      <PlayerCombatTab
        v-else-if="activeTab === 'combat'"
        :member="member"
        :wildshape-monster="beastMonster ?? undefined"
        :attack-disadvantage="attackDisadvantage"
        :attack-penalty="exhaustionD20Penalty"
        :check-disadvantage="checkDisadvantage"
        :check-penalty="exhaustionD20Penalty"
        @roll="onChildRoll"
      />

      <!-- Inventory (DM only: the player has it in their nav) -->
      <CharacterInventory
        v-else-if="activeTab === 'inventory'"
        :member-id="resolvedMemberId ?? null"
        :show-stash="false"
      />

      <!-- Lore -->
      <PlayerLoreTab
        v-else-if="activeTab === 'lore'"
        :member="member"
        :is-owner="isOwner"
      />

      <!-- Wild Shape -->
      <PlayerWildShapeTab
        v-else-if="activeTab === 'wildshape'"
        :member="member"
        :can-manage="canManage"
      />

      <!-- Kin (#1083). The DM's party page passes a memberId and edits; the player portal
           (and the DM previewing it) reads only what the player may know. -->
      <FamilyBlock
        :person="personKey('pc', member.id)"
        :player="!props.memberId"
        :title="props.memberId ? 'Family' : 'Your family'"
        framed
      />
    </template>

    <RollToast :result="lastRoll" />

    <HandOverDialog
      v-if="handOverOpen && member && campaign.activeCampaignId"
      open
      :member="member"
      :campaign-id="campaign.activeCampaignId"
      @close="handOverOpen = false"
    />
    <SetDownDialog v-if="retireOpen && member" open mode="retired" :member="member" @close="retireOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, watch, onBeforeUnmount, provide } from "vue";
import { useRoute, useRouter } from "vue-router";
import { INVENTORY_LINK, DEFAULT_INVENTORY_LINK } from "@/components/player/inventoryLink";
import { useWildshapeDruid } from "@/composables/player/useWildshapeDruid";
import { scrollParentOf } from "@/lib/scrollParent";
import { useAuthStore } from "@/stores/auth";
import { useAppUiStore } from "@/stores/ui/app";
import { useCampaignStore } from "@/stores/campaign";
import { useParty } from "@/composables/party/useParty";
import { provideCharacterRuleset } from "@/composables/rules/useRuleset";
import { useCharacterRolls } from "@/composables/party/useCharacterRolls";
import type { PartyMember } from "@/types/party.types";
import { useRules, usePlayerVisibleRules } from "@/composables/rules/useRules";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { lazyPanel } from "@/components/common/feedback/lazyPanel";
import { useBelow } from "@/composables/useBreakpoint";
import AbilityScoreTable from "@/components/common/statblock/AbilityScoreTable.vue";
import RollToast from "@/components/common/feedback/RollToast.vue";
import CharacterEditionNotice from "@/components/player/CharacterEditionNotice.vue";
import CharacterApprovalNotice from "@/components/player/CharacterApprovalNotice.vue";
import AcCalculatedNotice from "@/components/player/AcCalculatedNotice.vue";
import PlayerCharacterHeader from "@/components/player/PlayerCharacterHeader.vue";
import PlayerHpStrip from "@/components/player/PlayerHpStrip.vue";
import PlayerConditions from "@/components/player/PlayerConditions.vue";
import PlayerTracksSection from "@/components/player/PlayerTracksSection.vue";
import CharacterCaretakingNotice from "@/components/player/caretaking/CharacterCaretakingNotice.vue";
import HandOverDialog from "@/components/party/HandOverDialog.vue";
import { useCaretaking } from "@/composables/party/useCaretaking";
import type { OverflowMenuEntry } from "@/components/common/overlays/OverflowMenu.vue";
import FamilyBlock from "@/components/kinship/FamilyBlock.vue";
import { personKey } from "@/lib/kinship/keys";
import PlayerSkillsTab from "@/components/player/PlayerSkillsTab.vue";
import { useSpecies } from "@/composables/rules/useSpecies";
import OverflowMenu from "@/components/common/overlays/OverflowMenu.vue";
import MemorialBanner from "@/components/memorials/MemorialBanner.vue";
import { useCampaignMemorials } from "@/composables/memorials/useMemorials";

// Skills is the tab the sheet opens on and stays static; the others, the
// shapeshifter section and the retire dialog load when first shown.

const PlayerCombatTab = lazyPanel(() => import("@/components/player/PlayerCombatTab.vue"));
const PlayerFeaturesTab = lazyPanel(() => import("@/components/player/PlayerFeaturesTab.vue"));
const PlayerAppearanceSection = defineAsyncComponent(() => import("@/components/player/PlayerAppearanceSection.vue"));
const CharacterInventory = lazyPanel(() => import("@/components/inventory/CharacterInventory.vue"));
const PlayerLoreTab = lazyPanel(() => import("@/components/player/PlayerLoreTab.vue"));
const PlayerWildShapeTab = lazyPanel(() => import("@/components/player/PlayerWildShapeTab.vue"));
const SetDownDialog = defineAsyncComponent(() => import("@/components/memorials/SetDownDialog.vue"));

const props = defineProps<{
  memberId?: string;
  hidePlayerActions?: boolean;
  /** The DM's character page: adds an Inventory tab and points "open inventory" links at it. */
  showInventory?: boolean;
}>();
const emit = defineEmits<{ (e: "level-up"): void }>();

const auth = useAuthStore();
const appUi = useAppUiStore();
const campaign = useCampaignStore();

// The character is resolved first so its ruleset scope is provided before any
// composable below (or any child) reads an edition. See useRuleset.ts.
const { data: partyMembers } = useParty();
const resolvedMemberId = computed(() =>
  props.memberId ?? (appUi.dmPreviewMode ? appUi.dmPreviewPartyMemberId : auth.linkedPartyMemberId),
);
const member = computed<PartyMember | null>(() =>
  resolvedMemberId.value && partyMembers.value
    ? (partyMembers.value.find((m) => m.id === resolvedMemberId.value) ?? null)
    : null,
);
provideCharacterRuleset(() => member.value);

// DM preview gets all rules; players get only player-visible ones.
const { data: dmRules }     = useRules();
const { data: playerRules } = usePlayerVisibleRules();
const customTrackers = computed(() => {
  const rules = appUi.dmPreviewMode ? (dmRules.value ?? []) : (playerRules.value ?? []);
  return rules
    .filter((r) => r.tracker !== null)
    .map((r) => ({ ruleId: r.id, def: r.tracker! }));
});

// ── Rolls and Wild Shape ───────────────────────────────────────────────────────
// Ability checks, saves, the Wild Shape form's scores, conditions and the roll
// toast are shared with Hearth: see useCharacterRolls.
const {
  activeWildshape,
  beastMonster,
  effectiveScores,
  overrideScores,
  saves,
  attackDisadvantage,
  checkDisadvantage,
  exhaustionD20Penalty,
  lastRoll,
  onChildRoll,
  rollAbility,
  rollSave,
} = useCharacterRolls(member);

const { isDruid } = useWildshapeDruid(resolvedMemberId, () => member.value);

// Seated: this is the character the signed-in player's seat points at. That is
// true of the owner and of someone looking after it (#1059).
const isSeated = computed(
  () => !appUi.dmPreviewMode && !!auth.linkedPartyMemberId && auth.linkedPartyMemberId === member.value?.id,
);

// ── Looking after a character (#1059) ─────────────────────────────────────────
const handOverOpen = ref(false);
const { loaded: caretakingLoaded, handOver, isMindingThis } = useCaretaking(() => member.value, () => !!props.memberId);
/** Build and story controls: the owner's, not a caretaker's. */
const isOwner = computed(() => isSeated.value && !isMindingThis.value);

// ── Memorial (#982) ───────────────────────────────────────────────────────────
// The sheet stays as it was; a banner says where they are, and the owner may retire.
const { data: memorials } = useCampaignMemorials();
const memorialInEffect = computed(() =>
  member.value && memorials.value
    ? (memorials.value.find((m) => m.party_member_id === member.value?.id && m.restored_at === null) ?? null)
    : null,
);
const memberOwnedByMe = computed(
  () => !!member.value && member.value.owner_user_id !== null && member.value.owner_user_id === auth.user?.id,
);
const memorialViewer = computed<"dm" | "owner" | "other">(() =>
  auth.isDM ? "dm" : memberOwnedByMe.value ? "owner" : "other",
);
const retireOpen = ref(false);
/** Only the owner retires from here; marking a character fallen is the DM's, on the party page. */
const canRetire = computed(() => memberOwnedByMe.value && !appUi.dmPreviewMode && !memorialInEffect.value);

// The owner edits their own character; the DM does from the preview and from the
// party page (the only place a memberId is passed in). Anyone else reads.
const canManage = computed(() => isSeated.value || appUi.dmPreviewMode || !!props.memberId);

const ownerMenuItems = computed<OverflowMenuEntry[]>(() => {
  const m = member.value;
  if (!m) return [];
  const items: OverflowMenuEntry[] = [];
  if (memberOwnedByMe.value && !appUi.dmPreviewMode && caretakingLoaded.value && !handOver.value) {
    items.push({ key: "hand-over", label: `Ask someone to look after ${m.name}` });
  }
  if (canRetire.value) items.push({ key: "retire", label: "Retire…" });
  return items;
});
function onOwnerMenu(key: string) {
  if (key === "hand-over") handOverOpen.value = true;
  else if (key === "retire") retireOpen.value = true;
}

// ── Shapeshifter ───────────────────────────────────────────────────────────────
const trueSpeciesId = computed(() => member.value?.species_id ?? "");
const { data: trueSpecies } = useSpecies(trueSpeciesId);
const canShapeshift = computed(
  () => !!trueSpecies.value?.is_shapeshifter,
);

// ── Tabs ───────────────────────────────────────────────────────────────────────
const ALL_TABS = [
  { id: "skills",    label: "Skills"    },
  { id: "features",  label: "Features"  },
  { id: "combat",    label: "Combat"    },
  { id: "inventory", label: "Inventory" },
  { id: "lore",      label: "Lore"      },
  { id: "wildshape", label: "Wild Shape" },
] as const;
type TabId = (typeof ALL_TABS)[number]["id"];
const isPhone = useBelow("sm");

// Wild Shape tab is only visible for Druids (or if somehow wildshaped)
const visibleTabs = computed(() =>
  ALL_TABS.filter((t) => {
    if (t.id === "inventory") return !!props.showInventory;
    return t.id !== "wildshape" || isDruid.value || !!activeWildshape.value;
  }),
);
// The tab lives in ?tab= so /party/<id>?tab=inventory deep-links, and so the sheet's
// "open inventory" links can switch it. Read each time, never copied, so a followed link
// changes the tab.
const route = useRoute();
const router = useRouter();
const activeTab = computed<TabId>({
  get() {
    const asked = route.query.tab;
    return visibleTabs.value.find((t) => t.id === asked)?.id ?? "skills";
  },
  set(tab) {
    void router.replace({ query: { ...route.query, tab } });
  },
});
provide(INVENTORY_LINK, props.showInventory ? { query: { tab: "inventory" } } : DEFAULT_INVENTORY_LINK);
const tabOptions = computed(() => visibleTabs.value.map((t) => ({ value: t.id, label: t.label })));

// ── Hit points strip ──────────────────────────────────────────────────────────
// The header's hit point row is watched against the sheet's scroller; once it has
// scrolled off the top, the strip takes over so damage never needs a scroll back.
const sheetCard = ref<HTMLElement | null>(null);
const hpRowOutOfSight = ref(false);
/** The strip's height while shown; the tab row sticks this far below the scroller's top. */
const hpStripHeight = ref(0);
let hpRowObserver: IntersectionObserver | null = null;

watch(sheetCard, (card) => {
  hpRowObserver?.disconnect();
  hpRowObserver = null;
  const row = card?.querySelector("[data-hp-row]");
  if (!card || !row || typeof IntersectionObserver === "undefined") return;
  hpRowObserver = new IntersectionObserver(
    ([entry]) => {
      const top = entry.rootBounds?.top ?? 0;
      hpRowOutOfSight.value = !entry.isIntersecting && entry.boundingClientRect.bottom <= top;
    },
    { root: scrollParentOf(card), threshold: 0 },
  );
  hpRowObserver.observe(row);
}, { flush: "post" });

onBeforeUnmount(() => {
  hpRowObserver?.disconnect();
});
</script>

