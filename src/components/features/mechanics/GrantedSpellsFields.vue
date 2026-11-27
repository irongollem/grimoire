<template>
  <div class="flex flex-col gap-3">
    <div v-for="{ grant, spell, name } in rows" :key="grant.spell_id" class="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <p class="text-label-lg font-semibold text-foreground">{{ name }}</p>
          <p v-if="spell" class="text-caption text-muted-foreground">{{ spellLevelLabel(spell.level) }}</p>
        </div>
        <AppButton
          variant="ghost"
          tone="danger"
          size="icon-sm"
          :icon="IconDelete"
          icon-size="xs"
          :aria-label="`Remove ${name}`"
          @click="emit('update:grants', grants.filter((other) => other.spell_id !== grant.spell_id))"
        />
      </div>

      <MechField label="Casting ability">
        <AppSelect :model-value="grant.casting_ability ?? ''" tone="card" size="body" weight="normal" block @update:model-value="setAbility(grant, $event)">
          <option value="">Default</option>
          <option value="feat_ability_increase">Ability increased by this feat</option>
          <option value="int">Intelligence</option>
          <option value="wis">Wisdom</option>
          <option value="cha">Charisma</option>
        </AppSelect>
      </MechField>

      <AppCheckbox
        v-if="(spell && spell.level > 0) || grant.free_cast"
        :model-value="!!grant.free_cast"
        label="Also cast without a spell slot"
        label-role="caption"
        @update:model-value="toggleFreeCast(grant, $event)"
      />
      <div v-if="grant.free_cast" class="flex flex-wrap gap-2">
        <MechField label="Free casts" class="w-24">
          <AppInput
            :model-value="grant.free_cast.uses"
            type="number"
            min="1"
            tone="card"
            size="body"
            @update:model-value="setFreeCasts(grant, Number($event))"
          />
        </MechField>
        <MechField label="Regain after" class="min-w-32 flex-1">
          <AppSelect
            :model-value="grant.free_cast.resets_on"
            tone="card"
            size="body"
            weight="normal"
            block
            @update:model-value="setFreeCastRest(grant, $event)"
          >
            <option value="short_rest">Short rest</option>
            <option value="long_rest">Long rest</option>
          </AppSelect>
        </MechField>
      </div>
    </div>

    <MechField label="Add a spell">
      <EntityCombobox
        :model-value="''"
        :options="availableSpells"
        :placeholder="isLoading ? 'Loading spells…' : 'Search spells…'"
        @update:model-value="addSpell"
      >
        <template #option="{ opt }">
          <span class="min-w-0 flex-1">
            <span class="block">{{ opt.name }}</span>
            <span class="block text-caption text-muted-foreground">{{ opt.is_shared ? labelFor(opt.source) : 'Homebrew' }}</span>
          </span>
          <span class="shrink-0 text-caption text-muted-foreground">{{ spellLevelLabel(opt.level) }}</span>
        </template>
      </EntityCombobox>
    </MechField>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useSourceTitles } from "@/composables/library/useSourceTitles";
import { useSpellIndex } from "@/composables/spells/useSpellIndex";
import { useSpellsByIds } from "@/composables/spells/useSpellsByIds";
import { IconDelete } from "@/lib/icons";
import type { FeatureSpellGrant } from "@/rules/features/mechanics.types";
import type { RulesetKey } from "@/types/ruleset.types";
import { spellLevelLabel } from "@/types/spell.types";
import MechField from "./MechField.vue";

const { grants, ruleset } = defineProps<{ grants: FeatureSpellGrant[]; ruleset?: RulesetKey }>();
const emit = defineEmits<{ "update:grants": [value: FeatureSpellGrant[]] }>();

type FreeCast = NonNullable<FeatureSpellGrant["free_cast"]>;

const { data: spellIndex, isLoading } = useSpellIndex(() => ({ ruleset }));
const { labelFor } = useSourceTitles();
const grantedIds = computed(() => new Set(grants.map((grant) => grant.spell_id)));
const availableSpells = computed(() => (spellIndex.value ?? []).filter((spell) => !grantedIds.value.has(spell.id)));
const indexedById = computed(() => new Map(spellIndex.value?.map((spell) => [spell.id, spell])));
const { data: storedSpells, isLoading: loadingStoredSpells } = useSpellsByIds(() => [...grantedIds.value]);
const rows = computed(() => grants.map((grant) => {
  const spell = storedSpells.value.get(grant.spell_id) ?? indexedById.value.get(grant.spell_id);
  return { grant, spell, name: spell?.name ?? (loadingStoredSpells.value ? "Loading spell…" : "Unavailable spell") };
}));

function addSpell(id: string) {
  if (id && !grantedIds.value.has(id)) emit("update:grants", [...grants, { spell_id: id }]);
}

function updateGrant(grant: FeatureSpellGrant) {
  emit("update:grants", grants.map((other) => other.spell_id === grant.spell_id ? grant : other));
}

function setAbility(grant: FeatureSpellGrant, value: FeatureSpellGrant["casting_ability"] | "") {
  const { casting_ability: _ability, ...rest } = grant;
  updateGrant(value ? { ...rest, casting_ability: value } : rest);
}

function toggleFreeCast(grant: FeatureSpellGrant, enabled: boolean) {
  const { free_cast: _free, ...rest } = grant;
  updateGrant(enabled ? { ...rest, free_cast: { uses: 1, resets_on: "long_rest" } } : rest);
}

function setFreeCasts(grant: FeatureSpellGrant, uses: number) {
  if (grant.free_cast) updateGrant({ ...grant, free_cast: { ...grant.free_cast, uses } });
}

function setFreeCastRest(grant: FeatureSpellGrant, resetsOn: FreeCast["resets_on"]) {
  if (grant.free_cast) updateGrant({ ...grant, free_cast: { ...grant.free_cast, resets_on: resetsOn } });
}
</script>
