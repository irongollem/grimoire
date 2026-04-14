<template>
  <div class="flex flex-col gap-4">
    <!-- Inner section toggle -->
    <div class="flex gap-1 p-1 rounded-lg bg-muted w-fit">
      <button
        v-for="s in codexSections"
        :key="s.id"
        type="button"
        class="px-3 py-1.5 rounded-md font-cinzel text-xs font-semibold transition-colors"
        :class="
          codexSection === s.id
            ? 'bg-card text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        "
        @click="codexSection = s.id"
      >
        {{ s.label }}
      </button>
    </div>

    <!-- ── Species ── -->
    <div v-if="codexSection === 'species'">
      <div v-if="!allSpecies?.length" class="text-center py-12">
        <p class="font-fell text-sm text-muted-foreground italic">
          No species in the campaign yet.
        </p>
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-2 items-start">
        <div
          v-for="species in allSpecies"
          :key="species.id"
          class="rounded-lg border border-border bg-card overflow-hidden"
        >
          <button
            type="button"
            class="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
            @click="toggle(`sp:${species.id}`)"
          >
            <ChevronRight
              class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200"
              :class="open.has(`sp:${species.id}`) ? 'rotate-90' : ''"
            />
            <span
              class="font-cinzel text-sm font-bold text-foreground flex-1"
              >{{ species.name }}</span
            >
            <span
              v-if="species.size"
              class="shrink-0 px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground capitalize"
              >{{ species.size }}</span
            >
            <span
              v-if="species.subraces?.length"
              class="shrink-0 font-cinzel text-[10px] text-muted-foreground/60"
            >
              {{ species.subraces.length }} variant{{
                species.subraces.length > 1 ? "s" : ""
              }}
            </span>
          </button>

          <div
            v-if="open.has(`sp:${species.id}`)"
            class="border-t border-border flex flex-col"
          >
            <!-- Artwork banner -->
            <div
              v-if="species.image_url"
              class="h-40 w-full overflow-hidden bg-muted"
            >
              <FocalImage
                :src="species.image_url"
                :alt="species.name"
                format="landscape"
                :focal-point="species.focal_point ?? null"
              />
            </div>

            <div class="px-4 py-4 flex flex-col gap-4">
              <!-- Description -->
              <RichTextViewer
                v-if="isRichText(species.description)"
                :content="species.description!"
              />
              <p
                v-else-if="species.description"
                class="font-fell text-sm text-muted-foreground"
              >
                {{ species.description }}
              </p>

              <!-- Speed -->
              <div v-if="species.speed" class="flex flex-wrap gap-2">
                <span
                  v-for="(val, mode) in species.speed"
                  :key="mode"
                  class="px-2 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground capitalize"
                  >{{ mode }} {{ val }} ft</span
                >
              </div>

              <!-- Ability score increases -->
              <div
                v-if="
                  species.ability_score_increases &&
                  Object.keys(species.ability_score_increases).length
                "
              >
                <p
                  class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider mb-1.5"
                >
                  ABILITY SCORE INCREASES
                </p>
                <div class="flex flex-wrap gap-1.5">
                  <span
                    v-for="(val, key) in species.ability_score_increases"
                    :key="key"
                    class="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-[11px] text-primary uppercase"
                    >{{ key }} +{{ val }}</span
                  >
                </div>
              </div>

              <!-- Traits -->
              <div v-if="species.traits?.length">
                <p
                  class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider mb-1.5"
                >
                  TRAITS
                </p>
                <div class="flex flex-col gap-1">
                  <div
                    v-for="trait in species.traits"
                    :key="trait.name"
                    class="rounded-md border border-border overflow-hidden"
                  >
                    <button
                      type="button"
                      class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/20 transition-colors"
                      :class="
                        trait.description ? 'cursor-pointer' : 'cursor-default'
                      "
                      @click="
                        trait.description &&
                        toggle(`sp:${species.id}:t:${trait.name}`)
                      "
                    >
                      <ChevronRight
                        v-if="trait.description"
                        class="h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform"
                        :class="
                          open.has(`sp:${species.id}:t:${trait.name}`)
                            ? 'rotate-90'
                            : ''
                        "
                      />
                      <span class="font-fell text-sm text-foreground">{{
                        trait.name
                      }}</span>
                    </button>
                    <div
                      v-if="
                        trait.description &&
                        open.has(`sp:${species.id}:t:${trait.name}`)
                      "
                      class="px-3 pb-3 border-t border-border"
                    >
                      <RichTextViewer
                        v-if="isRichText(trait.description)"
                        :content="trait.description"
                        class="mt-2"
                      />
                      <p
                        v-else
                        class="font-fell text-sm text-muted-foreground mt-2"
                      >
                        {{ trait.description }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Languages -->
              <div v-if="species.languages?.length">
                <p
                  class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider mb-1.5"
                >
                  LANGUAGES
                </p>
                <div class="flex flex-wrap gap-1.5">
                  <span
                    v-for="lang in species.languages"
                    :key="lang"
                    class="px-2 py-0.5 rounded bg-muted font-fell text-xs text-muted-foreground"
                    >{{ lang }}</span
                  >
                </div>
              </div>

              <!-- Subraces / Variants -->
              <div v-if="species.subraces?.length">
                <p
                  class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider mb-1.5"
                >
                  VARIANTS
                </p>
                <div class="flex flex-col gap-1.5">
                  <div
                    v-for="sub in species.subraces"
                    :key="sub.name"
                    class="rounded-md border border-border overflow-hidden"
                  >
                    <button
                      type="button"
                      class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/20 transition-colors"
                      @click="toggle(`sp:${species.id}:sr:${sub.name}`)"
                    >
                      <ChevronRight
                        class="h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform"
                        :class="
                          open.has(`sp:${species.id}:sr:${sub.name}`)
                            ? 'rotate-90'
                            : ''
                        "
                      />
                      <span
                        class="font-cinzel text-xs font-semibold text-foreground"
                        >{{ sub.name }}</span
                      >
                    </button>
                    <div
                      v-if="open.has(`sp:${species.id}:sr:${sub.name}`)"
                      class="px-3 pb-3 border-t border-border flex flex-col gap-2 pt-2"
                    >
                      <div
                        v-if="sub.description"
                        class="font-fell text-sm text-muted-foreground"
                      >
                        <RichTextViewer
                          v-if="isRichText(sub.description)"
                          :content="sub.description"
                        />
                        <p v-else class="italic">{{ sub.description }}</p>
                      </div>
                      <div
                        v-if="sub.traits?.length"
                        class="flex flex-col gap-1"
                      >
                        <div
                          v-for="trait in sub.traits"
                          :key="trait.name"
                          class="rounded border border-border/60 overflow-hidden"
                        >
                          <button
                            type="button"
                            class="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-muted/20 transition-colors"
                            :class="
                              trait.description
                                ? 'cursor-pointer'
                                : 'cursor-default'
                            "
                            @click="
                              trait.description &&
                              toggle(
                                `sp:${species.id}:sr:${sub.name}:t:${trait.name}`,
                              )
                            "
                          >
                            <ChevronRight
                              v-if="trait.description"
                              class="h-2.5 w-2.5 shrink-0 text-muted-foreground/60 transition-transform"
                              :class="
                                open.has(
                                  `sp:${species.id}:sr:${sub.name}:t:${trait.name}`,
                                )
                                  ? 'rotate-90'
                                  : ''
                              "
                            />
                            <span class="font-fell text-sm text-foreground">{{
                              trait.name
                            }}</span>
                          </button>
                          <div
                            v-if="
                              trait.description &&
                              open.has(
                                `sp:${species.id}:sr:${sub.name}:t:${trait.name}`,
                              )
                            "
                            class="px-2.5 pb-2.5 border-t border-border/60"
                          >
                            <RichTextViewer
                              v-if="isRichText(trait.description)"
                              :content="trait.description"
                              class="mt-2"
                            />
                            <p
                              v-else
                              class="font-fell text-sm text-muted-foreground mt-2"
                            >
                              {{ trait.description }}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Backgrounds ── -->
    <div v-else-if="codexSection === 'backgrounds'">
      <div v-if="!allBackgrounds?.length" class="text-center py-12">
        <p class="font-fell text-sm text-muted-foreground italic">
          No backgrounds in the campaign yet.
        </p>
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-2 items-start">
        <div
          v-for="bg in allBackgrounds"
          :key="bg.id"
          class="rounded-lg border border-border bg-card overflow-hidden"
        >
          <button
            type="button"
            class="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
            @click="toggle(`bg:${bg.id}`)"
          >
            <ChevronRight
              class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200"
              :class="open.has(`bg:${bg.id}`) ? 'rotate-90' : ''"
            />
            <span class="font-cinzel text-sm font-bold text-foreground flex-1">{{ bg.name }}</span>
            <span v-if="bg.source_title" class="shrink-0 font-cinzel text-[10px] text-muted-foreground/60">{{ bg.source_title }}</span>
          </button>

          <div v-if="open.has(`bg:${bg.id}`)" class="border-t border-border flex flex-col">
            <div v-if="bg.image_url" class="h-40 w-full overflow-hidden bg-muted">
              <FocalImage :src="bg.image_url" :alt="bg.name" format="landscape" :focal-point="bg.focal_point ?? null" />
            </div>
            <div class="px-4 py-4 flex flex-col gap-4">
              <RichTextViewer v-if="isRichText(bg.description)" :content="bg.description!" />
              <p v-else-if="bg.description" class="font-fell text-sm text-muted-foreground">{{ bg.description }}</p>

              <div v-if="bg.skill_proficiencies?.length">
                <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider mb-1.5">SKILL PROFICIENCIES</p>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="s in bg.skill_proficiencies" :key="s" class="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 font-cinzel text-[11px] text-primary">{{ s }}</span>
                </div>
              </div>

              <div v-if="bg.tool_proficiencies?.length">
                <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider mb-1.5">TOOL PROFICIENCIES</p>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="t in bg.tool_proficiencies" :key="t" class="px-2 py-0.5 rounded bg-muted font-fell text-xs text-muted-foreground">{{ t }}</span>
                </div>
              </div>

              <div v-if="bg.languages?.length">
                <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider mb-1.5">LANGUAGES</p>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="l in bg.languages" :key="l" class="px-2 py-0.5 rounded bg-muted font-fell text-xs text-muted-foreground">{{ l }}</span>
                </div>
              </div>

              <div v-if="bg.equipment">
                <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider mb-1.5">EQUIPMENT</p>
                <p class="font-fell text-sm text-muted-foreground">{{ bg.equipment }}</p>
              </div>

              <div v-if="bg.feature_name">
                <p class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider mb-1.5">FEATURE</p>
                <p class="font-cinzel text-xs font-semibold text-foreground mb-1">{{ bg.feature_name }}</p>
                <p v-if="bg.feature_description" class="font-fell text-sm text-muted-foreground">{{ bg.feature_description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Classes ── -->
    <div v-else-if="codexSection === 'classes'">
      <div v-if="!mergedClasses.length" class="text-center py-12">
        <p class="font-fell text-sm text-muted-foreground italic">
          No classes in the campaign yet.
        </p>
      </div>
      <div v-else class="flex flex-col gap-2">
        <div
          v-for="cls in mergedClasses"
          :key="cls.class_name"
          class="rounded-lg border border-border bg-card overflow-hidden"
        >
          <button
            type="button"
            class="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
            @click="toggle(`cls:${cls.class_name}`)"
          >
            <ChevronRight
              class="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200"
              :class="open.has(`cls:${cls.class_name}`) ? 'rotate-90' : ''"
            />
            <span
              class="font-cinzel text-sm font-bold text-foreground flex-1"
              >{{ cls.class_name }}</span
            >
            <span
              class="shrink-0 px-1.5 py-0.5 rounded bg-muted font-cinzel text-[10px] text-muted-foreground"
              >d{{ cls.hit_die }}</span
            >
            <span
              v-if="subclassesFor(cls.class_name).length"
              class="shrink-0 font-cinzel text-[10px] text-muted-foreground/60"
            >
              {{ subclassesFor(cls.class_name).length }} subclass{{
                subclassesFor(cls.class_name).length > 1 ? "es" : ""
              }}
            </span>
          </button>

          <div
            v-if="open.has(`cls:${cls.class_name}`)"
            class="border-t border-border px-4 py-4 flex flex-col gap-4"
          >
            <!-- Quick stats -->
            <div class="grid grid-cols-2 gap-3">
              <div v-if="cls.primary_ability">
                <p
                  class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-0.5"
                >
                  PRIMARY
                </p>
                <p class="font-fell text-sm text-foreground">
                  {{ cls.primary_ability }}
                </p>
              </div>
              <div v-if="cls.saving_throws?.length">
                <p
                  class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-0.5"
                >
                  SAVING THROWS
                </p>
                <p class="font-fell text-sm text-foreground">
                  {{ cls.saving_throws.join(", ") }}
                </p>
              </div>
              <div v-if="cls.armor_proficiencies?.length">
                <p
                  class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-0.5"
                >
                  ARMOR
                </p>
                <p class="font-fell text-sm text-foreground">
                  {{ cls.armor_proficiencies.join(", ") }}
                </p>
              </div>
              <div v-if="cls.weapon_proficiencies?.length">
                <p
                  class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-0.5"
                >
                  WEAPONS
                </p>
                <p class="font-fell text-sm text-foreground">
                  {{ cls.weapon_proficiencies.join(", ") }}
                </p>
              </div>
              <div>
                <p
                  class="font-cinzel text-[10px] text-muted-foreground tracking-wider mb-0.5"
                >
                  SUBCLASS AT
                </p>
                <p class="font-fell text-sm text-foreground">
                  Level {{ cls.subclass_level }}
                </p>
              </div>
            </div>

            <!-- Features by level -->
            <div v-if="Object.keys(cls.features ?? {}).length">
              <p
                class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider mb-1.5"
              >
                CLASS FEATURES
              </p>
              <div class="flex flex-col gap-1">
                <div
                  v-for="lvl in sortedLevels(cls.features)"
                  :key="lvl"
                  class="flex gap-3 px-2 py-1.5 rounded bg-muted/30"
                >
                  <span
                    class="font-cinzel text-[10px] text-muted-foreground tracking-wider w-10 shrink-0 pt-0.5"
                    >Lv {{ lvl }}</span
                  >
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="name in resolveFeatures(cls.features[String(lvl)])"
                      :key="name"
                      class="inline-flex items-center rounded border bg-card border-border px-1.5 py-0.5 font-fell text-xs text-foreground"
                      >{{ name }}</span
                    >
                  </div>
                </div>
              </div>
            </div>

            <!-- Subclasses -->
            <div v-if="subclassesFor(cls.class_name).length">
              <p
                class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider mb-1.5"
              >
                SUBCLASSES
              </p>
              <div class="flex flex-col gap-1.5">
                <div
                  v-for="sub in subclassesFor(cls.class_name)"
                  :key="sub.subclass_name"
                  class="rounded-md border border-border overflow-hidden"
                >
                  <button
                    type="button"
                    class="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/20 transition-colors"
                    @click="
                      toggle(`sub:${cls.class_name}:${sub.subclass_name}`)
                    "
                  >
                    <ChevronRight
                      class="h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform"
                      :class="
                        open.has(`sub:${cls.class_name}:${sub.subclass_name}`)
                          ? 'rotate-90'
                          : ''
                      "
                    />
                    <span
                      class="font-cinzel text-xs font-semibold text-foreground"
                      >{{ sub.subclass_name }}</span
                    >
                  </button>
                  <div
                    v-if="
                      open.has(`sub:${cls.class_name}:${sub.subclass_name}`)
                    "
                    class="px-3 pb-3 border-t border-border pt-2"
                  >
                    <div
                      v-if="Object.keys(sub.features ?? {}).length"
                      class="flex flex-col gap-1"
                    >
                      <div
                        v-for="lvl in sortedLevels(sub.features)"
                        :key="lvl"
                        class="flex gap-3 py-1"
                      >
                        <span
                          class="font-cinzel text-[10px] text-muted-foreground tracking-wider w-10 shrink-0 pt-0.5"
                          >Lv {{ lvl }}</span
                        >
                        <div class="flex flex-wrap gap-1">
                          <span
                            v-for="name in resolveFeatures(
                              sub.features[String(lvl)],
                            )"
                            :key="name"
                            class="inline-flex items-center rounded border bg-muted/50 border-border/60 px-1.5 py-0.5 font-fell text-xs text-foreground"
                            >{{ name }}</span
                          >
                        </div>
                      </div>
                    </div>
                    <p
                      v-else
                      class="font-fell text-xs text-muted-foreground italic"
                    >
                      No features defined.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, shallowRef } from "vue";
import { ChevronRight } from "lucide-vue-next";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { useAllSpecies } from "@/composables/useSpecies";
import { useBackgrounds } from "@/composables/useBackgrounds";
import {
  useAllSystemClasses,
  useAllCustomClasses,
} from "@/composables/useCustomClasses";
import { useAllCustomSubclasses } from "@/composables/useCustomSubclasses";
import { useAllFeatures } from "@/composables/useFeatures";
import type { CustomFeatures } from "@/levelup/customTypes";

const codexSections = [
  { id: "species",     label: "Species" },
  { id: "backgrounds", label: "Backgrounds" },
  { id: "classes",     label: "Classes" },
] as const;
type CodexSection = (typeof codexSections)[number]["id"];
const codexSection = ref<CodexSection>("species");

const { data: allSpecies } = useAllSpecies();
const { data: allBackgrounds } = useBackgrounds();
const { data: systemClasses } = useAllSystemClasses();
const { data: customClasses } = useAllCustomClasses();
const { data: allCustomSubclasses } = useAllCustomSubclasses();
const { data: allFeatures } = useAllFeatures();

const mergedClasses = computed(() => {
  const byName = new Map<
    string,
    {
      class_name: string;
      hit_die: number;
      primary_ability: string | null;
      saving_throws: string[];
      armor_proficiencies: string[];
      weapon_proficiencies: string[];
      subclass_level: number;
      features: CustomFeatures;
    }
  >();
  for (const c of systemClasses.value ?? []) byName.set(c.class_name, c);
  for (const c of customClasses.value ?? []) {
    if (!byName.has(c.class_name)) byName.set(c.class_name, c);
  }
  return [...byName.values()].sort((a, b) =>
    a.class_name.localeCompare(b.class_name),
  );
});

function subclassesFor(className: string) {
  return (allCustomSubclasses.value ?? []).filter(
    (s) => s.class_name === className,
  );
}

const featureMap = computed(() => {
  const m = new Map<string, string>();
  for (const f of allFeatures.value ?? []) m.set(f.id, f.name);
  return m;
});

function resolveFeatures(ids: string[]): string[] {
  return ids.map((id) => featureMap.value.get(id) ?? id);
}

function sortedLevels(features: CustomFeatures): number[] {
  return Object.keys(features)
    .map(Number)
    .filter((n) => !isNaN(n) && features[String(n)].length > 0)
    .sort((a, b) => a - b);
}

function isRichText(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

const open = shallowRef(new Set<string>());
function toggle(key: string) {
  const next = new Set(open.value);
  if (next.has(key)) { next.delete(key); } else { next.add(key); }
  open.value = next;
}
</script>
