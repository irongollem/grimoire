<template>
  <Teleport to="body">
    <div
      v-if="trap"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      @click.self="emit('close')"
      @keydown.escape="emit('close')"
    >
      <div class="w-full max-w-lg bg-card border border-border rounded-xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden">

        <!-- Header -->
        <div class="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
          <span
            class="text-label font-bold px-2 py-0.5 rounded text-white shrink-0"
            :class="TRAP_TYPE_BG[trap.trap_type]"
          >{{ trap.trap_type }}</span>
          <h2 class="font-cinzel text-sm font-bold text-foreground flex-1 truncate">{{ trap.name }}</h2>
          <span v-if="trap.cr" class="font-cinzel text-xs text-muted-foreground shrink-0">
            CR {{ trap.cr }} · {{ crToXp(trap.cr) }} XP
          </span>
          <AppButton
            variant="ghost"
            size="icon-xs"
            icon-size="md"
            :icon="IconClose"
            aria-label="Close"
            class="ml-1 shrink-0"
            @click="emit('close')"
          />
        </div>

        <!-- Scrollable body -->
        <div class="flex-1 overflow-y-auto">

          <!-- Image + identity row -->
          <div v-if="trap.image_url || trap.tags.length" class="flex gap-4 px-5 pt-4">
            <FocalImage
              v-if="trap.image_url"
              :src="trap.image_url"
              :alt="trap.name"
              format="portrait"
              :focal-point="trap.image_focal_point"
              class="w-24 h-24 rounded-lg shrink-0 object-cover"
            />
            <div class="flex-1 flex flex-col gap-2 justify-center">
              <div v-if="trap.tags.length" class="flex flex-wrap gap-1">
                <span
                  v-for="tag in trap.tags"
                  :key="tag"
                  class="text-label px-2 py-0.5 rounded bg-muted text-muted-foreground"
                >{{ tag }}</span>
              </div>
              <div v-if="trap.damage_immunities?.length" class="flex flex-wrap gap-1">
                <span class="text-label text-muted-foreground mr-1">Immune:</span>
                <span
                  v-for="dmg in trap.damage_immunities"
                  :key="dmg"
                  class="text-label px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 capitalize"
                >{{ dmg }}</span>
              </div>
            </div>
          </div>

          <!-- Mechanics -->
          <div class="px-5 pt-4">
            <div class="text-label text-muted-foreground mb-2">MECHANICS</div>
            <div class="grid grid-cols-3 gap-x-4 gap-y-2">
              <div v-if="trap.trigger_type">
                <div class="text-label text-muted-foreground">Trigger</div>
                <div class="text-body text-foreground">{{ trap.trigger_type }}</div>
              </div>
              <div v-if="trap.detection_dc">
                <div class="text-label text-muted-foreground">Detection DC</div>
                <div class="font-cinzel text-sm font-bold text-foreground">{{ trap.detection_dc }}</div>
              </div>
              <div v-if="trap.disarm_dc">
                <div class="text-label text-muted-foreground">Disarm DC</div>
                <div class="font-cinzel text-sm font-bold text-foreground">{{ trap.disarm_dc }}</div>
              </div>
              <div>
                <div class="text-label text-muted-foreground">Reset</div>
                <div class="text-body text-foreground">{{ trap.reset_type }}</div>
              </div>
              <div v-if="trap.trap_hp">
                <div class="text-eyebrow text-muted-foreground">HP</div>
                <div class="font-cinzel text-sm font-bold text-foreground">{{ trap.trap_hp }}</div>
              </div>
              <div v-if="trap.trap_ac">
                <div class="text-eyebrow text-muted-foreground">AC</div>
                <div class="font-cinzel text-sm font-bold text-foreground">{{ trap.trap_ac }}</div>
              </div>
            </div>
          </div>

          <!-- Effect -->
          <div
            v-if="trap.effect_description || trap.attack_bonus != null || trap.save_type || trap.damage_entries?.length"
            class="px-5 pt-4"
          >
            <div class="text-label text-muted-foreground mb-2">EFFECT</div>
            <p v-if="trap.effect_description" class="text-body text-foreground mb-2">
              {{ trap.effect_description }}
            </p>
            <div class="flex flex-wrap gap-4">
              <div v-if="trap.attack_bonus != null">
                <div class="text-label text-muted-foreground">Attack</div>
                <div class="font-cinzel text-sm font-bold text-foreground">
                  {{ trap.attack_bonus >= 0 ? "+" : "" }}{{ trap.attack_bonus }}
                </div>
              </div>
              <div v-if="trap.save_type">
                <div class="text-label text-muted-foreground">Save</div>
                <div class="font-cinzel text-sm font-bold text-foreground">
                  {{ trap.save_type }} DC {{ trap.save_dc ?? "—" }}
                </div>
              </div>
              <div v-if="trap.damage_entries?.length">
                <div class="text-label text-muted-foreground">Damage</div>
                <div class="font-cinzel text-sm font-bold text-foreground capitalize">
                  <span v-for="(entry, i) in trap.damage_entries" :key="i">
                    <span v-if="i > 0" class="text-muted-foreground font-normal"> + </span>
                    {{ entry.dice }}<span v-if="entry.type" class="font-normal text-xs"> {{ entry.type }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Description -->
          <div v-if="descriptionHtml" class="px-5 pt-4">
            <div class="text-label text-muted-foreground mb-2">DESCRIPTION</div>
            <div class="prose prose-sm prose-invert max-w-none text-body text-foreground" v-html="descriptionHtml" />
          </div>

          <!-- DM Notes -->
          <div v-if="notesHtml" class="px-5 pt-4 pb-2">
            <div class="text-label text-muted-foreground mb-2">DM NOTES</div>
            <div class="prose prose-sm prose-invert max-w-none text-body text-foreground" v-html="notesHtml" />
          </div>

          <div class="h-4" />
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
          <button
            type="button"
            class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
            @click="emit('close')"
          >Close</button>
          <RouterLink
            :to="`/traps/${trap.id}`"
            class="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 font-cinzel text-xs font-semibold text-foreground hover:border-primary/50 transition-colors"
            @click="emit('close')"
          >
            <IconEdit class="h-3.5 w-3.5" />
            Edit Trap
          </RouterLink>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { IconClose, IconEdit } from '@/lib/icons';
import { renderTiptapHtml } from "@/lib/tiptap/renderTiptap";
import AppButton from "@/components/common/AppButton.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import { TRAP_TYPE_BG } from "@/types/trap.types";
import { crToXp } from "@/types/encounter.types";
import type { Trap } from "@/types/trap.types";

const props = defineProps<{ trap: Trap | null }>();
const emit = defineEmits<{ close: [] }>();

function renderRichText(content: string | null): string {
  return renderTiptapHtml(content);
}

const descriptionHtml = computed(() => renderRichText(props.trap?.description ?? null));
const notesHtml = computed(() => renderRichText(props.trap?.notes ?? null));
</script>
