<template>
  <!-- No overflow-hidden here: the Attach menu opens below the action row, past
       the card's bottom edge, and clipping the card clipped the menu to a
       sliver, so a pool character could not be attached at all. Nothing in the
       card needs the clip; the portrait rounds itself. -->
  <div class="rounded-lg border border-border bg-card">
    <div class="flex gap-3 p-3">
      <!-- Portrait -->
      <div class="w-16 h-20 rounded-md overflow-hidden bg-muted shrink-0 flex items-center justify-center">
        <FocalImage
          v-if="character.portrait_url"
          :src="character.portrait_url"
          :alt="character.name"
          format="portrait"
          :focal-point="character.portrait_focal_point ?? null"
        />
        <span v-else class="text-title font-bold text-muted-foreground/50">{{ initial }}</span>
      </div>

      <!-- Info -->
      <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <h3 class="text-heading-xs font-bold text-foreground truncate">{{ character.name }}</h3>
          <p class="text-caption text-muted-foreground italic mt-0.5 truncate">{{ summary }}</p>
          <div class="flex flex-wrap items-center gap-1 mt-1">
            <!--
              Status text, not controls, and deliberately not the tinted AppButton:
              tried on 2 Oct 2026, it gave a campaign's name a button's weight and
              ornament directly above the card's real buttons.
            -->
            <span
              class="inline-block text-label px-1.5 py-0.5 rounded"
              :class="attachedCampaign ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'"
            >
              {{ attachedCampaign?.name ?? 'Resting' }}
            </span>
            <span
              v-if="attachedCampaign && waitingCount > 0"
              class="inline-block text-label px-1.5 py-0.5 rounded bg-tone-caution/15 text-ink-caution"
              data-testid="waiting-marker"
            >
              Waiting for approval
            </span>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex flex-wrap items-center gap-1.5 mt-2">
          <template v-if="attachedCampaign">
            <AppButton variant="primary" size="md" label="Continue" @click="continueCharacter" />
            <OverflowMenu :label="`More actions for ${character.name}`" :items="menuItems" @select="onMenu" />
          </template>
          <template v-else>
            <div ref="attachRoot" class="relative">
              <AppButton
                variant="primary"
                size="md"
                label="Attach"
                @click="showAttachPicker = !showAttachPicker"
              />
              <div
                v-if="showAttachPicker"
                data-slip class="absolute z-20 mt-1 w-60 rounded-md border border-border bg-card shadow-lg p-1.5 space-y-1"
              >
                <p v-if="!availableCampaigns.length" class="text-caption text-muted-foreground italic px-1.5 py-1">
                  No campaigns to join yet.
                </p>
                <AppButton
                  v-for="c in availableCampaigns"
                  :key="c.id"
                  variant="ghost"
                  size="xs"
                  block
                  :label="tableLabel(c)"
                  :disabled="attaching"
                  class="justify-start text-left whitespace-normal"
                  @click="attachTo(c)"
                />
              </div>
            </div>
            <OverflowMenu :label="`More actions for ${character.name}`" :items="menuItems" @select="onMenu" />
          </template>
        </div>
      </div>
    </div>

    <RulesetBounceDialog
      v-if="bounce"
      :character="character"
      :campaign-ruleset="bounce.campaignRuleset"
      :campaign-name="bounce.campaignName"
      :bring="bringToBounceTable"
      @close="bounce = null"
      @choose-another="chooseAnotherTable"
      @joined="onBounceJoined"
    />
  </div>
</template>

<script setup lang="ts">
// #729/#730 Adventurer's Rest — one card per pooled character (attached or
// resting). Self-contained: owns its own mutations, confirm dialogs and the
// attach picker, so PlayerHomeView only has to hand it the character plus the
// two campaign lookups it can't resolve on its own.
import { computed, ref, useTemplateRef } from "vue";
import { useRouter } from "vue-router";
import { onClickOutside } from "@vueuse/core";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { FALLEN_DELETE_REASON, hasMemorialInEffect, useWallMemorials } from "@/composables/memorials/useMemorials";
import { useAttachCharacter, useDetachCharacter, useCloneCharacter, useDeletePoolCharacter } from "@/composables/party/useCharacterPool";
import { StartingEquipmentError } from "@/composables/party/useCharacterEquipmentSeeding";
import FocalImage from "@/components/common/media/FocalImage.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import OverflowMenu, { type OverflowMenuEntry } from "@/components/common/overlays/OverflowMenu.vue";
import RulesetBounceDialog from "@/components/player/RulesetBounceDialog.vue";
import { benchedMessage, useBenchedAfterAttach } from "@/composables/party/useBenchedAfterAttach";
import { isRulesetAdmissible, parseRulesetBounce, rulesetRules, rulesetYear } from "@/composables/party/useCharacterRuleset";
import type { RulesetKey } from "@/types/ruleset.types";
import type { PartyMember } from "@/types/party.types";
import type { Campaign } from "@/types/campaign.types";

const { character, attachedCampaign, availableCampaigns, waitingCount } = defineProps<{
  character: PartyMember;
  /** The campaign this character is currently attached to, resolved by the parent. Null when resting. */
  attachedCampaign: Campaign | null;
  /** Campaigns where the caller's role is "player" — the only valid attach targets. */
  availableCampaigns: Campaign[];
  /** Flags still benching this character; the parent reads them for the whole list in one query. */
  waitingCount: number;
}>();

const router = useRouter();
const campaignStore = useCampaignStore();
const auth = useAuthStore();
const { confirm } = useConfirm();
const toast = useToast();

const { mutateAsync: attachChar, isPending: attaching } = useAttachCharacter();
const { mutateAsync: detachChar, isPending: detaching } = useDetachCharacter();
const { mutateAsync: cloneChar, isPending: cloning } = useCloneCharacter();
const { mutateAsync: deleteChar, isPending: deleting } = useDeletePoolCharacter();
const { data: wall } = useWallMemorials();
const onTheWall = computed(() => hasMemorialInEffect(wall.value?.memorials, character.id));

// A character just attached (this one, or the converted copy the bounce dialog
// made) may have been benched by the database; see `useBenchedAfterAttach`.
const { waitingAfterAttach } = useBenchedAfterAttach();

async function announceAttach(name: string, partyMemberId: string, table: string, plain?: string) {
  try {
    const waiting = await waitingAfterAttach(partyMemberId);
    if (waiting === 0) {
      if (plain) toast.success(plain);
      return;
    }
    toast.info(benchedMessage(name, table, waiting));
  } catch (e) {
    if (plain) toast.success(plain);
    toast.error(toast.fromError(e, "Couldn't check whether the character was benched."));
  }
}

// One clear primary on the card; everything else lives in the menu, with the
// destructive entry last.
const menuItems = computed<OverflowMenuEntry[]>(() =>
  attachedCampaign
    ? [
        { key: "detach", label: detaching.value ? "Detaching…" : "Detach", disabled: detaching.value },
        { key: "clone", label: cloning.value ? "Copying…" : "Make a copy", disabled: cloning.value },
      ]
    : [
        { key: "edit", label: "Edit" },
        { key: "clone", label: cloning.value ? "Copying…" : "Make a copy", disabled: cloning.value },
        {
          key: "delete",
          label: deleting.value ? "Deleting…" : "Delete",
          danger: true,
          disabled: deleting.value || onTheWall.value,
          reason: onTheWall.value ? FALLEN_DELETE_REASON : undefined,
        },
      ],
);

function onMenu(key: string) {
  if (key === "detach") void detachCharacter();
  else if (key === "clone") void cloneCharacter();
  else if (key === "edit") editCharacter();
  else if (key === "delete") void deleteCharacter();
}

const initial = computed(() => character.name.trim().charAt(0).toUpperCase() || "?");

const summary = computed(() => {
  const parts: string[] = [];
  if (character.class) {
    parts.push(character.subclass ? `${character.class} (${character.subclass})` : character.class);
  }
  if (character.subrace) parts.push(character.subrace);
  const levelStr = character.level ? `Level ${character.level}` : "Not yet levelled";
  const base = parts.length ? `${parts.join(" · ")} · ${levelStr}` : levelStr;
  return `${base} · ${rulesetYear(character.ruleset)}`;
});

// Tables list their edition, and say so when they will not take this character.
function tableLabel(c: Campaign): string {
  return isRulesetAdmissible(character, c)
    ? `${c.name} · ${rulesetYear(c.ruleset)}`
    : `${c.name} · plays the ${rulesetRules(c.ruleset)}`;
}

const showAttachPicker = ref(false);
const attachRoot = useTemplateRef<HTMLDivElement>("attachRoot");
onClickOutside(attachRoot, () => { showAttachPicker.value = false; });

async function continueCharacter() {
  if (!attachedCampaign) return;
  campaignStore.switchToCampaign(attachedCampaign);
  await auth.refreshMembership(attachedCampaign.id);
  await router.push({ name: "play" });
}

async function detachCharacter() {
  const ok = await confirm(
    `Detach ${character.name} from ${attachedCampaign?.name ?? "this campaign"}? They'll return to your resting pool.`,
    { title: "Detach Character", confirmLabel: "Detach", danger: false },
  );
  if (!ok) return;
  try {
    await detachChar(character.id);
  } catch (e) {
    toast.error(toast.fromError(e, "Couldn't detach the character."));
  }
}

async function cloneCharacter() {
  try {
    await cloneChar(character.id);
    toast.success(`A copy of ${character.name} is in your pool.`);
  } catch (e) {
    toast.error(toast.fromError(e, "Couldn't clone the character."));
  }
}

// A refused attach offers a converted copy instead of an error (#943).
interface BounceTarget {
  campaignId: string;
  campaignName: string;
  campaignRuleset: RulesetKey;
}
const bounce = ref<BounceTarget | null>(null);

function openBounce(c: Campaign, campaignRuleset: RulesetKey) {
  bounce.value = { campaignId: c.id, campaignName: c.name, campaignRuleset };
}

async function attachTo(c: Campaign) {
  showAttachPicker.value = false;
  if (!isRulesetAdmissible(character, c)) {
    openBounce(c, c.ruleset);
    return;
  }
  try {
    await attachChar({ partyMemberId: character.id, campaignId: c.id });
    await announceAttach(character.name, character.id, c.name);
  } catch (e) {
    // Attached: only the equipment is missing, and the toast says so.
    if (e instanceof StartingEquipmentError) {
      toast.error(e.message);
      await announceAttach(character.name, character.id, c.name);
      return;
    }
    // The table's setting may have changed since the list loaded.
    const refused = parseRulesetBounce(e);
    if (refused) openBounce(c, refused.campaignRuleset);
    else toast.error(toast.fromError(e, "Couldn't attach the character."));
  }
}

async function bringToBounceTable(partyMemberId: string) {
  if (!bounce.value) throw new Error("No table to join.");
  try {
    await attachChar({ partyMemberId, campaignId: bounce.value.campaignId });
  } catch (e) {
    // The copy did join; the dialog must not say it could not.
    if (!(e instanceof StartingEquipmentError)) throw e;
    toast.error(e.message);
  }
}

function chooseAnotherTable() {
  bounce.value = null;
  showAttachPicker.value = true;
}

async function onBounceJoined(copyId: string) {
  if (!bounce.value) return;
  const table = bounce.value.campaignName;
  bounce.value = null;
  await announceAttach(
    `${character.name} (copy)`, copyId, table,
    `${character.name} (copy) joined ${table}. The original is still in your pool.`,
  );
}

function editCharacter() {
  router.push({ name: "play-character-edit", query: { memberId: character.id } });
}

async function deleteCharacter() {
  const ok = await confirm(
    `Permanently delete ${character.name}? This cannot be undone.`,
    { title: "Delete Character", confirmLabel: "Delete", danger: true },
  );
  if (!ok) return;
  try {
    await deleteChar(character.id);
  } catch (e) {
    toast.error(toast.fromError(e, "Couldn't delete the character."));
  }
}
</script>
