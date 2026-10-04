<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="flex items-center justify-between gap-3 px-4 py-2.5">
      <div class="min-w-0">
        <p class="text-label-lg font-semibold">Known forms · {{ known.length }} of {{ cap }}</p>
        <p v-if="atCap && replaced" class="text-caption-sm text-muted-foreground italic">
          You can replace a form again after a long rest.
        </p>
        <p v-else-if="atCap" class="text-caption-sm text-muted-foreground italic">
          You can replace one form per long rest.
        </p>
      </div>
      <AppButton
        v-if="canManage && !atCap"
        variant="outline"
        size="xs"
        class="shrink-0"
        :label="picker === 'learn' ? 'Cancel' : 'Learn a form'"
        @click="togglePicker('learn')"
      />
    </div>

    <ul v-if="known.length" class="divide-y divide-border border-t border-border">
      <li v-for="entry in entries" :key="entry.id" class="flex items-center gap-2 px-4 py-1.5">
        <span class="text-caption font-semibold flex-1 min-w-0 truncate" :class="entry.monster ? '' : 'italic text-muted-foreground'">
          {{ entry.monster?.name ?? "Unknown form" }}
        </span>
        <span v-if="entry.monster?.stat_block" class="text-caption-sm text-muted-foreground shrink-0">
          CR {{ entry.monster.stat_block.challenge_rating }}
        </span>
        <template v-if="canManage">
          <AppButton
            v-if="!entry.monster"
            variant="outline"
            size="xs"
            label="Remove"
            @click="forget(entry.id)"
          />
          <AppButton
            v-else-if="atCap"
            variant="outline"
            size="xs"
            :label="replacing === entry.id ? 'Cancel' : 'Replace'"
            :disabled="replaced"
            @click="startReplace(entry.id)"
          />
        </template>
      </li>
    </ul>
    <p v-else class="border-t border-border px-4 py-3 text-caption text-muted-foreground italic">
      No forms learned yet. Learn a form to be able to take it.
    </p>

    <Transition v-bind="drawerTransition()">
      <div v-show="picker !== null" class="border-t border-border">
        <div v-if="picker !== null" class="space-y-2 pb-1">
          <p v-if="picker === 'replace'" class="px-4 pt-2 text-caption text-muted-foreground">
            Choose the form that replaces {{ replacingName }}.
          </p>
          <AppInput
            v-if="candidates.length > SEARCH_FROM"
            v-model="search"
            size="sm"
            placeholder="Search forms"
            class="mx-4 mt-2 w-auto"
          />
          <p v-if="!candidates.length" class="px-4 py-3 text-caption text-muted-foreground italic">
            No other legal forms to choose from.
          </p>
          <div v-else class="divide-y divide-border">
            <AppButton
              v-for="m in shownCandidates"
              :key="m.id"
              variant="menu"
              size="body"
              block
              :disabled="saving"
              @click="choose(m)"
            >
              <span class="text-caption font-semibold flex-1 min-w-0 truncate">{{ m.name }}</span>
              <span class="text-caption-sm text-muted-foreground shrink-0">CR {{ m.stat_block?.challenge_rating }}</span>
            </AppButton>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { useUpdatePartyMember } from "@/composables/party/useParty";
import { useToast } from "@/composables/useToast";
import { drawerTransition } from "@/lib/motion";
import { parseCr } from "@/lib/utils";
import {
  forgetKnownForm,
  knownFormIds,
  learnKnownForm,
  replaceKnownForm,
  wildShapeFormCost,
  type WildShapeRules,
} from "@/rules/wildshape";
import { usePlayerVisibleMonsters } from "@/composables/monsters/useMonsters";
import type { PlayerVisibleMonster } from "@/types/monster.types";
import type { PartyMember } from "@/types/party.types";

// 2024 Known Forms: the roster of beasts a druid can take, learned freely while
// there is room and replaced one at a time per long rest once it is full.
const SEARCH_FROM = 12;

const { member, rules, monsters, canManage } = defineProps<{
  member: PartyMember;
  rules: WildShapeRules;
  /** The roster's own monsters, resolved by id by the parent. The learn/replace
   *  candidates are NOT among them: the picker reads the whole list itself, and
   *  only once it opens. */
  monsters: readonly PlayerVisibleMonster[];
  canManage: boolean;
}>();

const toast = useToast();
const { mutateAsync: updateMember, isPending: saving } = useUpdatePartyMember();

const cap = computed(() => rules.knownForms ?? 0);
const known = computed(() => knownFormIds(member.class_choices));
const atCap = computed(() => known.value.length >= cap.value);
const replaced = computed(() => member.class_choices?.wild_shape_form_replaced === true);

const entries = computed(() =>
  known.value.map((id) => ({ id, monster: monsters.find((m) => m.id === id) ?? null })),
);

// "learn" adds to the roster; "replace" swaps out `replacing`. Neither is a list
// filter, so the search stays a local ref (CLAUDE.md, Sanctioned Exceptions).
const picker = ref<"learn" | "replace" | null>(null);
const replacing = ref<string | null>(null);
const search = ref("");

// The one place a player surface needs every legal beast, so the whole-list
// read waits until a picker is actually open (#972).
const { data: everyMonster } = usePlayerVisibleMonsters({ enabled: () => picker.value !== null });

const replacingName = computed(
  () => entries.value.find((e) => e.id === replacing.value)?.monster?.name ?? "this form",
);
const candidates = computed(() =>
  everyMonster.value
    .filter((m) => m.stat_block !== null && wildShapeFormCost(m, rules) !== null && !known.value.includes(m.id))
    .sort((a, b) => parseCr(a.stat_block?.challenge_rating) - parseCr(b.stat_block?.challenge_rating)),
);
const shownCandidates = computed(() => {
  const q = search.value.trim().toLowerCase();
  return q ? candidates.value.filter((m) => m.name.toLowerCase().includes(q)) : candidates.value;
});

function togglePicker(mode: "learn") {
  picker.value = picker.value === mode ? null : mode;
  replacing.value = null;
  search.value = "";
}

function startReplace(id: string) {
  if (replacing.value === id) {
    picker.value = null;
    replacing.value = null;
    return;
  }
  picker.value = "replace";
  replacing.value = id;
  search.value = "";
}

/** Write the roster back, merged into class_choices so no other choice is lost. */
async function save(ids: string[], extra: Record<string, unknown> = {}) {
  try {
    await updateMember({
      id: member.id,
      update: { class_choices: { ...member.class_choices, wild_shape_known_forms: ids, ...extra } },
    });
    picker.value = null;
    replacing.value = null;
  } catch (error) {
    toast.error(toast.fromError(error));
  }
}

async function choose(monster: PlayerVisibleMonster) {
  if (picker.value === "replace" && replacing.value) {
    if (replaced.value) return;
    await save(replaceKnownForm(known.value, replacing.value, monster.id), { wild_shape_form_replaced: true });
  } else {
    await save(learnKnownForm(known.value, monster.id, cap.value));
  }
}

/** An id that no longer resolves is not a form, so dropping it spends no replacement. */
async function forget(id: string) {
  await save(forgetKnownForm(known.value, id));
}
</script>
