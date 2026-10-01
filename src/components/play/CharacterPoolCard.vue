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
        <span v-else class="font-cinzel text-2xl font-bold text-muted-foreground/50">{{ initial }}</span>
      </div>

      <!-- Info -->
      <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <h3 class="font-cinzel text-sm font-bold text-foreground truncate">{{ character.name }}</h3>
          <p class="text-caption text-muted-foreground italic mt-0.5 truncate">{{ summary }}</p>
          <span
            class="inline-block mt-1 text-label px-1.5 py-0.5 rounded"
            :class="attachedCampaign ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'"
          >
            {{ attachedCampaign?.name ?? 'Resting' }}
          </span>
        </div>

        <!-- Actions -->
        <div class="flex flex-wrap items-center gap-1.5 mt-2">
          <template v-if="attachedCampaign">
            <AppButton variant="primary" size="xs" label="Continue" @click="continueCharacter" />
            <AppButton variant="subtle" size="xs" label="Detach" :loading="detaching" @click="detachCharacter" />
            <AppButton variant="subtle" size="xs" label="Clone" :loading="cloning" @click="cloneCharacter" />
          </template>
          <template v-else>
            <div ref="attachRoot" class="relative">
              <AppButton
                variant="primary"
                size="xs"
                label="Attach"
                @click="showAttachPicker = !showAttachPicker"
              />
              <div
                v-if="showAttachPicker"
                class="absolute z-20 mt-1 w-60 rounded-md border border-border bg-card shadow-lg p-1.5 space-y-1"
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
            <AppButton variant="subtle" size="xs" label="Edit" @click="editCharacter" />
            <AppButton variant="subtle" size="xs" label="Clone" :loading="cloning" @click="cloneCharacter" />
            <AppButton variant="destructive" size="xs" label="Delete" :loading="deleting" @click="deleteCharacter" />
          </template>
        </div>
      </div>
    </div>

    <RulesetBounceDialog
      v-if="bounce"
      :open="true"
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
import { useAttachCharacter, useDetachCharacter, useCloneCharacter, useDeletePoolCharacter } from "@/composables/party/useCharacterPool";
import FocalImage from "@/components/common/FocalImage.vue";
import AppButton from "@/components/common/AppButton.vue";
import RulesetBounceDialog from "@/components/play/RulesetBounceDialog.vue";
import { isRulesetAdmissible, parseRulesetBounce, rulesetRules, rulesetYear } from "@/composables/party/useCharacterRuleset";
import type { RulesetKey } from "@/types/ruleset.types";
import type { PartyMember } from "@/types/party.types";
import type { Campaign } from "@/types/campaign.types";

const { character, attachedCampaign, availableCampaigns } = defineProps<{
  character: PartyMember;
  /** The campaign this character is currently attached to, resolved by the parent. Null when resting. */
  attachedCampaign: Campaign | null;
  /** Campaigns where the caller's role is "player" — the only valid attach targets. */
  availableCampaigns: Campaign[];
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
    toast.error(toast.fromError(e));
  }
}

async function cloneCharacter() {
  try {
    await cloneChar(character.id);
    toast.success(`${character.name} was cloned.`);
  } catch (e) {
    toast.error(toast.fromError(e));
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
  } catch (e) {
    // The table's setting may have changed since the list loaded.
    const refused = parseRulesetBounce(e);
    if (refused) openBounce(c, refused.campaignRuleset);
    else toast.error(toast.fromError(e));
  }
}

async function bringToBounceTable(partyMemberId: string) {
  if (!bounce.value) throw new Error("No table to join.");
  await attachChar({ partyMemberId, campaignId: bounce.value.campaignId });
}

function chooseAnotherTable() {
  bounce.value = null;
  showAttachPicker.value = true;
}

function onBounceJoined() {
  if (!bounce.value) return;
  const table = bounce.value.campaignName;
  bounce.value = null;
  toast.success(`${character.name} (copy) joined ${table}. The original is still in your pool.`);
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
    toast.error(toast.fromError(e));
  }
}
</script>
