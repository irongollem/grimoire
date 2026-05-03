<template>
  <div class="flex flex-col gap-4">
    <!-- Breadcrumb: full ancestor chain -->
    <div
      v-if="ancestors.length || isNew"
      class="flex flex-wrap items-center gap-1 text-xs font-fell text-muted-foreground"
    >
      <RouterLink
        to="/locations"
        class="hover:text-foreground transition-colors"
        >Locations</RouterLink
      >
      <template v-for="anc in ancestors" :key="anc.id">
        <span class="opacity-40">/</span>
        <RouterLink
          :to="`/locations/${anc.id}`"
          class="hover:text-foreground transition-colors"
        >
          {{ anc.name }}
        </RouterLink>
      </template>
      <span class="opacity-40">/</span>
      <span class="text-foreground">{{
        isNew ? "New Location" : props.location?.name
      }}</span>
    </div>

    <!-- Action row: type + visibility + save + delete -->
    <div class="flex flex-wrap items-center gap-2 justify-end">
      <select
        v-model="locationType"
        class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option
          v-for="(label, value) in LOCATION_TYPE_LABELS"
          :key="value"
          :value="value"
        >
          {{ label }}
        </option>
      </select>
      <PlayerVisibilityToggle
        v-if="!isNew"
        :visible-to="playerVisibleTo"
        @update:visible-to="playerVisibleTo = $event"
      />
      <button
        v-if="!isNew"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-muted-foreground/50 transition-colors"
        @click="onCancel"
      >
        Cancel
      </button>
      <button
        type="button"
        :disabled="saving || !name.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <Save class="h-3.5 w-3.5" />
        {{ saving ? "Saving…" : isNew ? "Create" : "Save" }}
      </button>
      <button
        v-if="!isNew"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="remove"
      >
        <Trash2 class="h-3.5 w-3.5" />
        Delete
      </button>
    </div>

    <!--
      Sigil + identity fields.
      Mobile: stack vertically — sigil on top (capped to avoid eating the
      viewport), then Parent / Child / Tags / Calendar pins below at full
      viewport width. Gives the children list + comboboxes the whole screen
      to wrap in.
      Desktop (md+): original side-by-side layout, 12rem sigil on the left.
    -->
    <div class="flex flex-col gap-3 md:flex-row md:gap-5">
      <!-- Sigil -->
      <div class="w-full max-w-48 mx-auto md:mx-0 md:w-48 md:shrink-0">
        <ImageUpload
          :model-value="imageUrl"
          aspect="auto"
          placeholder="Sigil / Emblem"
          bucket="location-images"
          @update:model-value="imageUrl = $event"
        />
      </div>

      <!-- Name, parent, tags, sub-locations, calendar pins -->
      <div class="flex-1 flex flex-col gap-3 min-w-0">
        <input
          v-model="name"
          placeholder="Location name…"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />

        <div class="flex items-center gap-2">
          <span
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider shrink-0 w-16 flex items-center gap-1"
          >
            <ChevronUp class="h-3.5 w-3.5" />Parent
          </span>
          <EntityCombobox
            v-model="parentIdStr"
            :options="parentOptions"
            placeholder="— None (top-level) —"
          >
            <template #option="{ opt }">
              <span
                class="inline-block h-2 w-2 rounded-full shrink-0"
                :style="{
                  backgroundColor: LOCATION_TYPE_COLORS[opt.location_type],
                }"
              />
              <span class="flex-1 truncate">{{ opt.name }}</span>
              <span
                class="text-xs text-muted-foreground shrink-0 font-cinzel"
                >{{ LOCATION_TYPE_LABELS[opt.location_type] }}</span
              >
            </template>
          </EntityCombobox>
        </div>

        <!-- Compact sub-locations -->
        <div v-if="!isNew" class="flex items-start gap-2">
          <span
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider shrink-0 w-16 flex items-center gap-1 pt-1.5"
          >
            <MapPin class="h-3.5 w-3.5" />Child
          </span>
          <div
            class="flex-1 flex flex-wrap items-center gap-1.5 border border-border rounded-md px-3 py-1.5 min-h-8.5 bg-background relative"
          >
            <span
              v-if="childrenLoading"
              class="font-fell text-xs text-muted-foreground italic"
              >Loading…</span
            >
            <RouterLink
              v-for="child in children"
              :key="child.id"
              :to="`/locations/${child.id}`"
              class="inline-flex items-center gap-1.5 rounded border border-border bg-muted/50 hover:border-primary/50 hover:bg-muted transition-colors px-2 py-0.5 max-w-full min-w-0"
            >
              <span
                class="h-1.5 w-1.5 rounded-full shrink-0"
                :style="{
                  backgroundColor: LOCATION_TYPE_COLORS[child.location_type],
                }"
              />
              <span
                class="font-cinzel text-xs font-semibold text-foreground truncate"
                >{{ child.name }}</span
              >
            </RouterLink>
            <!-- Inline child search -->
            <div class="relative ml-auto">
              <input
                v-model="childSearch"
                type="text"
                placeholder="Add child…"
                class="font-cinzel text-xs text-foreground placeholder:text-muted-foreground/50 bg-transparent focus:outline-none w-24 focus:w-36 transition-all"
                @focus="childDropdownOpen = true"
                @blur="onChildBlur"
                @keydown.escape="childDropdownOpen = false"
              />
              <div
                v-if="
                  childDropdownOpen &&
                  (childOptions.length || childSearch.trim())
                "
                class="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border border-border bg-popover shadow-lg overflow-hidden"
              >
                <button
                  v-for="opt in childOptions"
                  :key="opt.id"
                  type="button"
                  class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted transition-colors"
                  @mousedown.prevent="addChild(opt)"
                >
                  <span
                    class="h-1.5 w-1.5 rounded-full shrink-0"
                    :style="{
                      backgroundColor: LOCATION_TYPE_COLORS[opt.location_type],
                    }"
                  />
                  <span
                    class="font-cinzel text-xs text-foreground truncate flex-1"
                    >{{ opt.name }}</span
                  >
                  <span
                    class="font-fell text-[10px] text-muted-foreground shrink-0"
                    >{{ LOCATION_TYPE_LABELS[opt.location_type] }}</span
                  >
                </button>
                <button
                  type="button"
                  class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted transition-colors border-t border-border text-primary"
                  @mousedown.prevent="createChild"
                >
                  <Plus class="h-3 w-3 shrink-0" />
                  <span class="font-cinzel text-xs truncate flex-1">
                    {{
                      childSearch.trim()
                        ? `Create "${childSearch.trim()}"`
                        : "Create new child location"
                    }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Related locations (non-hierarchical links) -->
        <div v-if="!isNew" class="flex items-start gap-2">
          <span
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider shrink-0 w-16 flex items-center gap-1 pt-1.5"
          >
            <Link class="h-3.5 w-3.5" />Related
          </span>
          <div
            class="flex-1 flex flex-wrap items-center gap-1.5 border border-border rounded-md px-3 py-1.5 min-h-8.5 bg-background relative"
          >
            <button
              v-for="relId in relatedLocationIds"
              :key="relId"
              type="button"
              class="inline-flex items-center gap-1.5 rounded border border-border bg-muted/50 hover:border-destructive/50 hover:bg-muted transition-colors px-2 py-0.5 max-w-full min-w-0 group"
              :title="`Remove ${relatedLocationMap.get(relId)?.name ?? relId}`"
              @click="removeRelated(relId)"
            >
              <span
                v-if="relatedLocationMap.get(relId)"
                class="h-1.5 w-1.5 rounded-full shrink-0"
                :style="{ backgroundColor: LOCATION_TYPE_COLORS[relatedLocationMap.get(relId)!.location_type] }"
              />
              <span class="font-cinzel text-xs font-semibold text-foreground truncate">
                {{ relatedLocationMap.get(relId)?.name ?? relId }}
              </span>
              <X class="h-2.5 w-2.5 text-muted-foreground group-hover:text-destructive shrink-0" />
            </button>
            <!-- Inline related search -->
            <div class="relative ml-auto">
              <input
                v-model="relatedSearch"
                type="text"
                placeholder="Add related…"
                class="font-cinzel text-xs text-foreground placeholder:text-muted-foreground/50 bg-transparent focus:outline-none w-24 focus:w-36 transition-all"
                @focus="relatedDropdownOpen = true"
                @blur="onRelatedBlur"
                @keydown.escape="relatedDropdownOpen = false"
              />
              <div
                v-if="relatedDropdownOpen && relatedOptions.length"
                class="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border border-border bg-popover shadow-lg overflow-hidden"
              >
                <button
                  v-for="opt in relatedOptions"
                  :key="opt.id"
                  type="button"
                  class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted transition-colors"
                  @mousedown.prevent="addRelated(opt)"
                >
                  <span
                    class="h-1.5 w-1.5 rounded-full shrink-0"
                    :style="{ backgroundColor: LOCATION_TYPE_COLORS[opt.location_type] }"
                  />
                  <span class="font-cinzel text-xs text-foreground truncate flex-1">{{ opt.name }}</span>
                  <span class="font-fell text-[10px] text-muted-foreground shrink-0">{{ LOCATION_TYPE_LABELS[opt.location_type] }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-start gap-2">
          <span
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider shrink-0 w-16 flex items-center gap-1 pt-1.5"
          >
            <Tag class="h-3.5 w-3.5" />Tags
          </span>
          <div class="flex-1"><TagInput v-model="tags" /></div>
        </div>

        <!-- Compact calendar pins -->
        <EntityCalendarSection
          compact
          entity-type="location"
          :entity-id="props.location?.id ?? null"
          :entity-name="name || 'Untitled Location'"
        />
      </div>
    </div>

    <p v-if="saveError" class="text-destructive font-fell text-sm">
      {{ saveError }}
    </p>

    <!-- Description editor -->
    <div class="flex flex-col gap-1">
      <span
        class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
        >Description</span
      >
      <RichTextEditor
        v-model="description"
        placeholder="Describe this location…"
        min-height="120px"
        :ai-context="`location description — ${name || 'unnamed location'}`"
      />
    </div>

    <!-- Player sharing options -->
    <div
      v-if="!isNew"
      class="flex flex-col gap-3 rounded-lg border border-border bg-card/50 px-4 py-3"
    >
      <span
        class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
        >Player Sharing</span
      >

      <!-- Player summary (always shown to players who can see this location) -->
      <div class="flex flex-col gap-1">
        <label
          class="font-cinzel text-[10px] text-muted-foreground tracking-wider"
          >Summary (always visible)</label
        >
        <input
          v-model="playerSummary"
          placeholder="A short description players always see when they discover this location…"
          class="w-full bg-background border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <!-- Share description -->
      <label
        class="inline-flex items-center justify-between gap-3 cursor-pointer"
      >
        <span class="font-cinzel text-xs text-foreground"
          >Share full description</span
        >
        <button
          type="button"
          class="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus:outline-none"
          :class="isDescriptionShared ? 'bg-primary' : 'bg-muted-foreground/30'"
          @click="isDescriptionShared = !isDescriptionShared"
        >
          <span
            class="inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
            :class="isDescriptionShared ? 'translate-x-3.5' : 'translate-x-0.5'"
          />
        </button>
      </label>

      <!-- Share linked NPCs -->
      <label
        class="inline-flex items-center justify-between gap-3 cursor-pointer"
      >
        <span class="font-cinzel text-xs text-foreground"
          >Share linked NPCs</span
        >
        <button
          type="button"
          class="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus:outline-none"
          :class="isNpcsShared ? 'bg-primary' : 'bg-muted-foreground/30'"
          @click="isNpcsShared = !isNpcsShared"
        >
          <span
            class="inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
            :class="isNpcsShared ? 'translate-x-3.5' : 'translate-x-0.5'"
          />
        </button>
      </label>

      <!-- Share inventory (store / tavern / inn only) -->
      <label
        v-if="STORE_LOCATION_TYPES.has(locationType)"
        class="inline-flex items-center justify-between gap-3 cursor-pointer"
      >
        <span class="font-cinzel text-xs text-foreground"
          >Share inventory with players</span
        >
        <button
          type="button"
          class="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus:outline-none"
          :class="isInventoryShared ? 'bg-primary' : 'bg-muted-foreground/30'"
          @click="isInventoryShared = !isInventoryShared"
        >
          <span
            class="inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
            :class="isInventoryShared ? 'translate-x-3.5' : 'translate-x-0.5'"
          />
        </button>
      </label>
    </div>

    <!-- Store inventory (store / tavern / inn only) -->
    <template v-if="!isNew && STORE_LOCATION_TYPES.has(locationType)">
      <!-- Owner NPC — used as the sender name on vendor offer messages -->
      <div class="flex items-center gap-3">
        <span class="font-cinzel text-xs text-foreground shrink-0"
          >Proprietor</span
        >
        <EntityCombobox
          :model-value="npcOwnerId"
          :options="npcOptions"
          placeholder="No proprietor set…"
          class="flex-1"
          @update:model-value="npcOwnerId = $event"
        />
      </div>
      <StoreInventory
        :location-id="props.location!.id"
        :owner-npc-name="ownerNpcName"
      />
    </template>

    <!-- NPCs at this location -->
    <template v-if="!isNew && locationNpcs?.length">
      <div class="flex items-center justify-between mt-2">
        <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">
          People in the Area
          <span class="font-fell font-normal text-muted-foreground"
            >({{ locationNpcs.length }})</span
          >
        </h2>
        <button
          v-if="locationNpcs.length > 3"
          type="button"
          class="font-cinzel text-[10px] text-muted-foreground hover:text-foreground transition-colors tracking-wider"
          @click="npcsExpanded = !npcsExpanded"
        >
          {{ npcsExpanded ? "Show less" : `Show all ${locationNpcs.length}` }}
        </button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <RouterLink
          v-for="npc in npcsExpanded ? locationNpcs : locationNpcs.slice(0, 3)"
          :key="npc.id"
          :to="`/npcs/${npc.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors p-3 overflow-hidden"
        >
          <div class="flex-1 min-w-0">
            <p
              class="font-cinzel text-sm font-semibold text-foreground truncate"
            >
              {{ npc.name }}
            </p>
            <p
              v-if="npc.occupation || npc.race"
              class="font-fell text-xs text-muted-foreground italic truncate"
            >
              {{ [npc.race, npc.occupation].filter(Boolean).join(" · ") }}
            </p>
            <p
              v-if="npc.location_id && npc.location_id !== props.location?.id"
              class="font-cinzel text-[10px] text-muted-foreground/60 tracking-wide truncate mt-0.5"
            >
              {{
                allLocations?.find((l) => l.id === npc.location_id)?.name ?? ""
              }}
            </p>
          </div>
          <ChevronRight
            class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0"
          />
        </RouterLink>
      </div>
    </template>

    <!-- Encounters at this location -->
    <template v-if="!isNew && locationEncounters?.length">
      <div class="flex items-center justify-between mt-2">
        <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">
          Encounters Here
          <span class="font-fell font-normal text-muted-foreground"
            >({{ locationEncounters.length }})</span
          >
        </h2>
      </div>
      <div class="flex flex-col gap-2">
        <RouterLink
          v-for="enc in locationEncounters"
          :key="enc.id"
          :to="`/encounters/${enc.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors px-4 py-3"
        >
          <span
            class="flex-1 font-cinzel text-sm font-semibold text-foreground truncate"
            >{{ enc.name }}</span
          >
          <span
            v-if="enc.is_finished"
            class="font-cinzel text-[10px] text-muted-foreground tracking-wider"
            >Done</span
          >
          <ChevronRight
            class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0"
          />
        </RouterLink>
      </div>
    </template>

    <!-- Party members currently here -->
    <template v-if="!isNew">
      <div class="flex items-center justify-between mt-2">
        <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">
          Currently Here
          <span
            class="font-fell font-normal text-muted-foreground"
            v-if="membersHere.length"
            >({{ membersHere.length }})</span
          >
        </h2>
      </div>

      <div v-if="membersHere.length" class="flex flex-wrap gap-2">
        <div
          v-for="m in membersHere"
          :key="m.id"
          class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5"
        >
          <RouterLink
            :to="`/party/${m.id}`"
            class="font-cinzel text-xs font-semibold text-foreground hover:text-primary transition-colors"
          >
            {{ m.name }}
          </RouterLink>
          <span
            v-if="m.class"
            class="font-fell text-[10px] text-muted-foreground italic"
            >{{ m.class }}</span
          >
          <button
            type="button"
            class="text-muted-foreground hover:text-destructive transition-colors text-sm leading-none ml-1"
            title="Remove from this location"
            @click="removeMemberFromLocation(m.id)"
          >
            ×
          </button>
        </div>
      </div>
      <p v-else class="font-fell text-xs text-muted-foreground italic">
        No party members currently here.
      </p>

      <!-- Add member to location -->
      <div class="flex items-center gap-2">
        <EntityCombobox
          v-model="newResidentId"
          :options="availableMembers"
          placeholder="Move a party member here…"
        />
        <button
          type="button"
          :disabled="!newResidentId || movingMember"
          class="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          @click="addMemberToLocation"
        >
          Move here
        </button>
      </div>
    </template>

    <!-- Map section -->
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span
          class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
          >Map</span
        >
        <label
          v-if="mapUrl && !isNew"
          class="inline-flex items-center gap-2 cursor-pointer"
          title="Share map with players"
        >
          <span class="font-cinzel text-xs text-muted-foreground tracking-wider"
            >Share with players</span
          >
          <button
            type="button"
            class="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus:outline-none"
            :class="isMapShared ? 'bg-primary' : 'bg-muted-foreground/30'"
            @click="isMapShared = !isMapShared"
          >
            <span
              class="inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
              :class="isMapShared ? 'translate-x-3.5' : 'translate-x-0.5'"
            />
          </button>
        </label>
      </div>

      <!-- No map: full drop zone -->
      <ImageUpload
        v-if="!mapUrl"
        :model-value="null"
        aspect="landscape"
        placeholder="Upload a map…"
        bucket="location-images"
        @update:model-value="mapUrl = $event"
      />

      <!-- Has map: interactive map + compact controls -->
      <template v-else>
        <LocationMap
          v-if="!isNew && children"
          :map-url="mapUrl"
          :pins="mapPins"
          :children="mapPinnableChildren"
          mode="edit"
          :show-hidden-pins="true"
          :compact="mapCompact"
          @update:pins="mapPins = $event"
          @pin-click="router.push(`/locations/${$event}`)"
        />
        <div class="flex items-center gap-2">
          <button
            type="button"
            :disabled="isMapUploading"
            class="font-cinzel text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            @click="mapFileInput?.click()"
          >
            {{ isMapUploading ? "Uploading…" : "Change map" }}
          </button>
          <span class="text-muted-foreground/40 text-xs">·</span>
          <button
            type="button"
            class="font-cinzel text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            :title="mapCompact ? 'Show full size' : 'Compact map'"
            @click="mapCompact = !mapCompact"
          >
            {{ mapCompact ? "Full size" : "Compact" }}
          </button>
          <span class="text-muted-foreground/40 text-xs">·</span>
          <button
            type="button"
            class="font-cinzel text-[10px] tracking-wider text-destructive hover:opacity-80 transition-opacity"
            @click="clearMap"
          >
            Remove
          </button>
          <input
            ref="mapFileInput"
            type="file"
            accept="image/*"
            class="sr-only"
            @change="onMapFileChange"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  Save,
  Trash2,
  ChevronRight,
  MapPin,
  ChevronUp,
  Tag,
  Plus,
  Link,
  X,
} from "lucide-vue-next";
import ImageUpload from "@/components/common/ImageUpload.vue";
import { useImageUpload } from "@/composables/useImageUpload";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import PlayerVisibilityToggle from "@/components/common/PlayerVisibilityToggle.vue";
import TagInput from "@/components/common/TagInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import LocationMap from "@/components/locations/LocationMap.vue";
import StoreInventory from "@/components/locations/StoreInventory.vue";
import { useNpcs, useNpcsByLocations } from "@/composables/useNpcs";
import { useEncountersByLocation } from "@/composables/useEncounters";
import EntityCalendarSection from "@/components/calendar/EntityCalendarSection.vue";
import {
  useLocations,
  useAllLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
  getPinnableDescendants,
} from "@/composables/useLocations";
import { useParty, useUpdatePartyMember } from "@/composables/useParty";
import {
  LOCATION_TYPE_LABELS,
  LOCATION_TYPE_COLORS,
  STORE_LOCATION_TYPES,
} from "@/types/location.types";
import type {
  Location,
  LocationType,
  MapPin as MapPinType,
} from "@/types/location.types";

const props = defineProps<{
  location: Location | null;
  parentId?: string | null;
  initialName?: string;
}>();

const router = useRouter();

// Drop the `?edit=true` flag so Cancel takes the DM back to the sheet view,
// preserving any other query params (e.g. ?parent=xxx for nested creates).
const route = useRoute();
function onCancel() {
  const { edit: _edit, ...rest } = route.query;
  router.push({ query: rest });
}
const isNew = computed(() => !props.location);

// ── All locations (for parent picker) ─────────────────────────────────────────
const { data: allLocations } = useAllLocations();

// ── Parent picker state ────────────────────────────────────────────────────────
const selectedParentId = ref<string | null>(
  props.location?.parent_id ?? props.parentId ?? null,
);

// Full ancestor chain for breadcrumb (root → … → direct parent)
const ancestors = computed(() => {
  if (!selectedParentId.value || !allLocations.value?.length) return [];
  const chain: Location[] = [];
  let current = allLocations.value.find((l) => l.id === selectedParentId.value);
  while (current && chain.length < 10) {
    chain.unshift(current);
    current = current.parent_id
      ? allLocations.value!.find((l) => l.id === current!.parent_id)
      : undefined;
  }
  return chain;
});

// EntityCombobox uses "" for "none"; selectedParentId uses null
const parentIdStr = computed({
  get: () => selectedParentId.value ?? "",
  set: (v: string) => {
    selectedParentId.value = v || null;
  },
});

const parentOptions = computed(() =>
  (allLocations.value ?? []).filter((l) => l.id !== props.location?.id),
);

// ── Fetch children (only when editing existing) ────────────────────────────────
const { data: children, isLoading: childrenLoading } = props.location
  ? useLocations(props.location.id)
  : { data: ref([]), isLoading: ref(false) };

// ── Pinnable descendants for the map's "Unplaced" picker ──────────────────────
// Recurses through vague container types (region / continent / country …) so
// the DM can place individual towns onto a regional map without having to
// flatten their hierarchy. See getPinnableDescendants() for the rules.
const mapPinnableChildren = computed(() => {
  if (!props.location || !allLocations.value?.length) return [];
  return getPinnableDescendants(props.location.id, allLocations.value);
});

// ── Child combobox ─────────────────────────────────────────────────────────────
const { mutateAsync: reparent } = useUpdateLocation();
const childSearch = ref("");
const childDropdownOpen = ref(false);

const childOptions = computed(() => {
  const q = childSearch.value.toLowerCase().trim();
  const childIds = new Set((children.value ?? []).map((c: Location) => c.id));
  return (allLocations.value ?? [])
    .filter(
      (l) =>
        l.id !== props.location?.id &&
        !childIds.has(l.id) &&
        (q === "" || l.name.toLowerCase().includes(q)),
    )
    .slice(0, 8);
});

async function addChild(loc: Location) {
  childSearch.value = "";
  childDropdownOpen.value = false;
  await reparent({ id: loc.id, update: { parent_id: props.location!.id } });
}

function onChildBlur() {
  setTimeout(() => {
    childDropdownOpen.value = false;
  }, 150);
}

function createChild() {
  const query: Record<string, string> = { parent: props.location!.id };
  if (childSearch.value.trim()) query.name = childSearch.value.trim();
  childSearch.value = "";
  childDropdownOpen.value = false;
  router.push({ path: "/locations/new", query });
}

// ── Related locations (non-hierarchical links) ─────────────────────────────────
const relatedLocationIds = ref<string[]>(
  props.location?.related_location_ids ? [...props.location.related_location_ids] : [],
);

const relatedLocationMap = computed<Map<string, Location>>(() => {
  const m = new Map<string, Location>();
  for (const loc of allLocations.value ?? []) m.set(loc.id, loc);
  return m;
});

const relatedSearch = ref("");
const relatedDropdownOpen = ref(false);

const relatedOptions = computed(() => {
  const q = relatedSearch.value.toLowerCase().trim();
  const excluded = new Set([props.location?.id ?? "", ...relatedLocationIds.value]);
  return (allLocations.value ?? [])
    .filter((l) => !excluded.has(l.id) && (q === "" || l.name.toLowerCase().includes(q)))
    .slice(0, 8);
});

function addRelated(loc: Location) {
  relatedSearch.value = "";
  relatedDropdownOpen.value = false;
  if (!relatedLocationIds.value.includes(loc.id)) {
    relatedLocationIds.value = [...relatedLocationIds.value, loc.id];
  }
}

function removeRelated(id: string) {
  relatedLocationIds.value = relatedLocationIds.value.filter((r) => r !== id);
}

function onRelatedBlur() {
  setTimeout(() => { relatedDropdownOpen.value = false; }, 150);
}

// ── NPCs + Encounters at this location (includes descendants) ──────────────────
function collectDescendantIds(
  id: string,
  allLocs: Location[],
  visited = new Set<string>(),
): string[] {
  if (visited.has(id)) return [];
  visited.add(id);
  const result: string[] = [id];
  for (const loc of allLocs) {
    if (loc.parent_id === id)
      result.push(...collectDescendantIds(loc.id, allLocs, visited));
  }
  return result;
}

const npcLocationIds = computed(() => {
  if (!props.location || !allLocations.value?.length) return [];
  return collectDescendantIds(props.location.id, allLocations.value);
});

const { data: locationNpcs } = props.location
  ? useNpcsByLocations(npcLocationIds)
  : { data: ref([]) };
const { data: locationEncounters } = props.location
  ? useEncountersByLocation(props.location.id)
  : { data: ref([]) };

// ── Party members currently at this location ───────────────────────────────────
const { data: allPartyMembers } = useParty();
const { mutateAsync: updatePartyMember, isPending: movingMember } =
  useUpdatePartyMember();

const membersHere = computed(() =>
  (allPartyMembers.value ?? []).filter(
    (m) => m.current_location_id === props.location?.id,
  ),
);

const availableMembers = computed(() =>
  (allPartyMembers.value ?? []).filter(
    (m) => m.current_location_id !== props.location?.id,
  ),
);

const newResidentId = ref("");

async function addMemberToLocation() {
  if (!newResidentId.value || !props.location) return;
  await updatePartyMember({
    id: newResidentId.value,
    update: { current_location_id: props.location.id },
  });
  newResidentId.value = "";
}

async function removeMemberFromLocation(memberId: string) {
  await updatePartyMember({
    id: memberId,
    update: { current_location_id: null },
  });
}

// ── Form state ─────────────────────────────────────────────────────────────────
const name = ref(props.location?.name ?? props.initialName ?? "");
const locationType = ref<LocationType>(
  props.location?.location_type ?? "other",
);
const tags = ref<string[]>(
  props.location?.tags ? [...props.location.tags] : [],
);
const imageUrl = ref<string | null>(props.location?.image_url ?? null);
const saving = ref(false);
const saveError = ref("");
const npcsExpanded = ref(false);

// ── Description ────────────────────────────────────────────────────────────────
const description = ref<string>(props.location?.description ?? "");

// ── Player sharing ─────────────────────────────────────────────────────────────
const playerVisibleTo = ref<string[]>(props.location?.player_visible_to ?? []);
const playerSummary = ref<string>(props.location?.player_summary ?? "");
const isDescriptionShared = ref<boolean>(
  props.location?.is_description_shared ?? false,
);
const isNpcsShared = ref<boolean>(props.location?.is_npcs_shared ?? false);
const isInventoryShared = ref<boolean>(
  props.location?.is_inventory_shared ?? false,
);
const npcOwnerId = ref<string>(props.location?.npc_owner_id ?? "");
const { data: allNpcs } = useNpcs();
const npcOptions = computed(() =>
  (allNpcs.value ?? []).map((n) => ({ id: n.id, name: n.name })),
);
const ownerNpcName = computed(
  () => allNpcs.value?.find((n) => n.id === npcOwnerId.value)?.name ?? null,
);

// ── Map ────────────────────────────────────────────────────────────────────────
const mapUrl = ref<string | null>(props.location?.map_url ?? null);
const mapPins = ref<MapPinType[]>(
  props.location?.map_pins ? [...props.location.map_pins] : [],
);
const isMapShared = ref<boolean>(props.location?.is_map_shared ?? false);
const mapCompact = ref(true);

// Keep denormalized pin metadata (type/name/image) in sync with live children data
// so saved maps always reflect the current child state (fixes player view colors).
watch(
  children,
  (currentChildren) => {
    if (!currentChildren?.length || !mapPins.value.length) return;
    mapPins.value = mapPins.value.map((pin) => {
      const child = (currentChildren as Location[]).find(
        (c) => c.id === pin.child_location_id,
      );
      return child
        ? {
            ...pin,
            child_type: child.location_type,
            child_name: child.name,
            child_image_url: child.image_url ?? null,
          }
        : pin;
    });
  },
  { immediate: true },
);

const mapFileInput = ref<HTMLInputElement | null>(null);
const {
  isUploading: isMapUploading,
  upload: uploadMapFile,
  remove: removeMapFile,
} = useImageUpload("location-images");

async function onMapFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const oldUrl = mapUrl.value;
  const url = await uploadMapFile(file);
  if (url) {
    mapUrl.value = url;
    if (oldUrl) await removeMapFile(oldUrl);
  }
  (e.target as HTMLInputElement).value = "";
}

async function clearMap() {
  if (mapUrl.value) await removeMapFile(mapUrl.value);
  mapUrl.value = null;
  mapPins.value = [];
}

// ── CRUD ───────────────────────────────────────────────────────────────────────
const { mutateAsync: create } = useCreateLocation();
const { mutateAsync: update } = useUpdateLocation();
const { mutateAsync: del } = useDeleteLocation();

function buildPayload() {
  return {
    name: name.value.trim() || "Unnamed Location",
    location_type: locationType.value,
    description: description.value,
    notes: null,
    tags: tags.value,
    parent_id: selectedParentId.value,
    image_url: imageUrl.value,
    map_url: mapUrl.value,
    map_pins: mapPins.value,
    is_map_shared: isMapShared.value,
    player_visible_to: playerVisibleTo.value,
    player_summary: playerSummary.value || null,
    is_description_shared: isDescriptionShared.value,
    is_npcs_shared: isNpcsShared.value,
    is_inventory_shared: isInventoryShared.value,
    npc_owner_id: npcOwnerId.value || null,
    related_location_ids: relatedLocationIds.value,
  };
}

async function save() {
  if (!name.value.trim()) return;
  saving.value = true;
  saveError.value = "";
  try {
    if (props.location) {
      await update({ id: props.location.id, update: buildPayload() });
      router.push(`/locations/${props.location.id}`);
    } else {
      const created = await create(buildPayload());
      router.push(`/locations/${created.id}`);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.location) return;
  if (
    !(await confirm(
      `Delete "${props.location.name}"? Sub-locations will also be deleted.`,
    ))
  )
    return;
  const parentId = props.location.parent_id;
  await del(props.location.id);
  router.push(parentId ? `/locations/${parentId}` : "/locations");
}
</script>
