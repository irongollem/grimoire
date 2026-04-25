<template>
  <!-- On desktop the view fills main's flex height; controls scroll independently. -->
  <div class="flex flex-col lg:flex-1 lg:min-h-0 lg:overflow-hidden">
    <PageHeader
      title="Illuminator"
      description="Apply torn-edge and fade treatments to images for use in Scriptorium."
    />

    <div class="px-4 pb-4 md:px-6 lg:flex-1 lg:min-h-0 lg:overflow-hidden">
      <div class="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 lg:h-full">

        <!-- ── Preview column ───────────────────────────────────────────── -->
        <div class="flex flex-col gap-3 lg:min-h-0 lg:overflow-hidden">

          <!-- Drop zone -->
          <div
            v-if="!sourceImage"
            class="relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-border bg-card transition-colors min-h-80 lg:flex-1 cursor-pointer"
            :class="isDragging ? 'border-primary bg-primary/5' : 'hover:border-primary/50'"
            @click="fileInput?.click()"
            @dragover.prevent="isDragging = true"
            @dragleave.prevent="isDragging = false"
            @drop.prevent="onDrop"
          >
            <ImageIcon class="h-10 w-10 text-muted-foreground/40" />
            <div class="text-center">
              <p class="font-cinzel text-sm font-semibold text-foreground">Drop an image here</p>
              <p class="font-fell text-sm text-muted-foreground mt-0.5">or click to browse — PNG, JPG, WebP</p>
            </div>
            <input
              ref="fileInput"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="sr-only"
              @change="onFileChange"
            />
          </div>

          <!-- Canvas preview -->
          <template v-else>
            <!-- On desktop: flex-1 + min-h-0 lets the canvas fill available height -->
            <div
              class="relative rounded-xl overflow-hidden lg:flex-1 lg:min-h-0 flex items-center justify-center"
              style="background: repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%) 0 0 / 20px 20px;"
            >
              <canvas
                ref="previewCanvas"
                class="block max-w-full lg:max-h-full"
                :class="dofEnabled ? 'cursor-crosshair' : ''"
                @click="onCanvasClick"
              />
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button
                type="button"
                class="font-cinzel text-xs tracking-wider text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                @click="clearImage"
              >Replace image</button>
              <span class="text-muted-foreground/40 text-xs">·</span>
              <span class="font-fell text-xs text-muted-foreground">
                {{ sourceFilename }} · {{ sourceImage.naturalWidth }}×{{ sourceImage.naturalHeight }}
              </span>
            </div>
          </template>
        </div>

        <!-- ── Controls column — scrolls independently on desktop ────────── -->
        <div class="flex flex-col rounded-xl border border-border bg-card overflow-hidden lg:min-h-0 lg:overflow-y-auto">

          <!-- ── Colour Grading section ──────────────────────────────────── -->
          <div>
            <div
              class="flex items-center px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer select-none"
              @click="gradingOpen = !gradingOpen"
            >
              <ChevronRightIcon
                class="h-3 w-3 shrink-0 text-muted-foreground transition-transform mr-2"
                :class="gradingOpen ? 'rotate-90' : ''"
              />
              <span
                class="flex-1 font-cinzel text-xs font-bold tracking-widest uppercase transition-colors"
                :class="gradingEnabled ? 'text-foreground' : 'text-muted-foreground'"
              >Colour Grading</span>
              <!-- Enable toggle pill — click.stop so it doesn't collapse the accordion -->
              <button
                type="button"
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
                :class="gradingEnabled ? 'bg-primary' : 'bg-muted-foreground/30'"
                @click.stop="gradingEnabled = !gradingEnabled"
              >
                <span
                  class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
                  :class="gradingEnabled ? 'translate-x-4.5' : 'translate-x-0.5'"
                />
              </button>
            </div>

            <!-- Body: presets + sliders — dimmed when disabled -->
            <div
              v-show="gradingOpen"
              class="px-4 pb-4 flex flex-col gap-3 transition-opacity"
              :class="gradingEnabled ? 'opacity-100' : 'opacity-35'"
            >
              <!-- Preset buttons -->
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase mr-1">Presets</span>
                <button
                  v-for="preset in GRADING_PRESETS"
                  :key="preset.label"
                  type="button"
                  class="font-cinzel text-[10px] tracking-wider px-2 py-0.5 rounded border border-border hover:border-primary hover:text-primary transition-colors"
                  @click="applyPreset(preset.values)"
                >{{ preset.label }}</button>
                <button
                  type="button"
                  class="font-cinzel text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors ml-auto"
                  @click="resetGrading"
                >Reset</button>
              </div>

              <!-- Grading sliders -->
              <div v-for="gs in GRADING_SLIDERS" :key="gs.key">
                <div class="flex items-center justify-between mb-1">
                  <label class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">
                    {{ gs.label }}
                  </label>
                  <span class="font-fell text-xs text-muted-foreground tabular-nums">
                    {{ gradingDisplay(gs.key) }}
                  </span>
                </div>
                <input
                  type="range"
                  :min="gs.min"
                  :max="gs.max"
                  :step="gs.step"
                  :value="grading[gs.key]"
                  class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
                  @input="(e) => setGradingSlider(gs.key, parseFloat((e.target as HTMLInputElement).value))"
                />
              </div>
            </div>
          </div>

          <!-- ── Vignette section ───────────────────────────────────────── -->
          <div class="border-t border-border">
            <div
              class="flex items-center px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer select-none"
              @click="vignetteOpen = !vignetteOpen"
            >
              <ChevronRightIcon
                class="h-3 w-3 shrink-0 text-muted-foreground transition-transform mr-2"
                :class="vignetteOpen ? 'rotate-90' : ''"
              />
              <span
                class="flex-1 font-cinzel text-xs font-bold tracking-widest uppercase transition-colors"
                :class="vignetteEnabled ? 'text-foreground' : 'text-muted-foreground'"
              >Vignette</span>
              <button
                type="button"
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
                :class="vignetteEnabled ? 'bg-primary' : 'bg-muted-foreground/30'"
                @click.stop="vignetteEnabled = !vignetteEnabled"
              >
                <span
                  class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
                  :class="vignetteEnabled ? 'translate-x-4.5' : 'translate-x-0.5'"
                />
              </button>
            </div>

            <!-- Body: mode + colour + sliders -->
            <div
              v-show="vignetteOpen"
              class="px-4 pb-4 flex flex-col gap-3 transition-opacity"
              :class="vignetteEnabled ? 'opacity-100' : 'opacity-35'"
            >
              <!-- Mode pill buttons -->
              <div class="flex items-center gap-1.5">
                <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase mr-1">Mode</span>
                <button
                  v-for="mode in (['transparent', 'colour'] as VignetteMode[])"
                  :key="mode"
                  type="button"
                  class="font-cinzel text-[10px] tracking-wider px-2 py-0.5 rounded border transition-colors"
                  :class="vignette.mode === mode
                    ? 'border-primary text-primary'
                    : 'border-border hover:border-primary/60 hover:text-foreground text-muted-foreground'"
                  @click="vignette.mode = mode"
                >{{ mode }}</button>
              </div>

              <!-- Colour picker — only in colour mode -->
              <div v-if="vignette.mode === 'colour'" class="flex items-center gap-2">
                <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Colour</span>
                <input
                  type="color"
                  :value="vignette.colour"
                  class="h-6 w-10 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  @input="(e) => { vignette.colour = (e.target as HTMLInputElement).value; }"
                />
                <span class="font-fell text-xs text-muted-foreground">{{ vignette.colour }}</span>
              </div>

              <!-- Strength slider -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Strength</label>
                  <span class="font-fell text-xs text-muted-foreground tabular-nums">{{ Math.round(vignette.strength * 100) }}</span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.01"
                  :value="vignette.strength"
                  class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
                  @input="(e) => { vignette.strength = parseFloat((e.target as HTMLInputElement).value); }"
                />
              </div>

              <!-- Softness slider -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Softness</label>
                  <span class="font-fell text-xs text-muted-foreground tabular-nums">{{ Math.round(vignette.softness * 100) }}</span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.01"
                  :value="vignette.softness"
                  class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
                  @input="(e) => { vignette.softness = parseFloat((e.target as HTMLInputElement).value); }"
                />
              </div>
            </div>
          </div>

          <!-- ── Texture Overlay section ──────────────────────────────────── -->
          <div class="border-t border-border">
            <div
              class="flex items-center px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer select-none"
              @click="textureOpen = !textureOpen"
            >
              <ChevronRightIcon
                class="h-3 w-3 shrink-0 text-muted-foreground transition-transform mr-2"
                :class="textureOpen ? 'rotate-90' : ''"
              />
              <span
                class="flex-1 font-cinzel text-xs font-bold tracking-widest uppercase transition-colors"
                :class="textureEnabled ? 'text-foreground' : 'text-muted-foreground'"
              >Texture Overlay</span>
              <button
                type="button"
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
                :class="textureEnabled && textureImage ? 'bg-primary' : 'bg-muted-foreground/30'"
                @click.stop="textureImage && (textureEnabled = !textureEnabled)"
              >
                <span
                  class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
                  :class="textureEnabled && textureImage ? 'translate-x-4.5' : 'translate-x-0.5'"
                />
              </button>
            </div>

            <div
              v-show="textureOpen"
              class="px-4 pb-4 flex flex-col gap-3 transition-opacity"
              :class="textureEnabled && textureImage ? 'opacity-100' : 'opacity-35'"
            >
              <!-- Texture upload -->
              <div
                v-if="!textureImage"
                class="flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-3 cursor-pointer hover:border-primary/50 transition-colors"
                @click="textureFileInput?.click()"
                @dragover.prevent
                @drop.prevent="onTextureDrop"
              >
                <span class="font-fell text-xs text-muted-foreground">Drop texture or click to upload</span>
                <input
                  ref="textureFileInput"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  class="sr-only"
                  @change="onTextureFileChange"
                />
              </div>
              <div v-else class="flex items-center gap-2">
                <span class="font-fell text-xs text-muted-foreground truncate flex-1">{{ textureFilename }}</span>
                <button
                  type="button"
                  class="font-cinzel text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  @click="clearTexture"
                >Remove</button>
              </div>

              <!-- Blend mode pills -->
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase mr-1">Blend</span>
                <button
                  v-for="mode in BLEND_MODES"
                  :key="mode"
                  type="button"
                  class="font-cinzel text-[10px] tracking-wider px-2 py-0.5 rounded border transition-colors"
                  :class="texture.blendMode === mode
                    ? 'border-primary text-primary'
                    : 'border-border hover:border-primary/60 hover:text-foreground text-muted-foreground'"
                  @click="texture.blendMode = mode"
                >{{ BLEND_MODE_LABELS[mode] }}</button>
              </div>

              <!-- Opacity slider -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Opacity</label>
                  <span class="font-fell text-xs text-muted-foreground tabular-nums">{{ Math.round(texture.opacity * 100) }}</span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.01"
                  :value="texture.opacity"
                  class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
                  @input="(e) => { texture.opacity = parseFloat((e.target as HTMLInputElement).value); }"
                />
              </div>

              <!-- Scale slider -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Tile scale</label>
                  <span class="font-fell text-xs text-muted-foreground tabular-nums">×{{ texture.scale.toFixed(2) }}</span>
                </div>
                <input
                  type="range" min="0.1" max="3" step="0.05"
                  :value="texture.scale"
                  class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
                  @input="(e) => { texture.scale = parseFloat((e.target as HTMLInputElement).value); }"
                />
              </div>
            </div>
          </div>

          <!-- ── Depth of Field section ─────────────────────────────────── -->
          <div class="border-t border-border">
            <div
              class="flex items-center px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer select-none"
              @click="dofOpen = !dofOpen"
            >
              <ChevronRightIcon
                class="h-3 w-3 shrink-0 text-muted-foreground transition-transform mr-2"
                :class="dofOpen ? 'rotate-90' : ''"
              />
              <span
                class="flex-1 font-cinzel text-xs font-bold tracking-widest uppercase transition-colors"
                :class="dofEnabled ? 'text-foreground' : 'text-muted-foreground'"
              >Depth of Field</span>
              <button
                type="button"
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
                :class="dofEnabled ? 'bg-primary' : 'bg-muted-foreground/30'"
                @click.stop="dofEnabled = !dofEnabled"
              >
                <span
                  class="inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform"
                  :class="dofEnabled ? 'translate-x-4.5' : 'translate-x-0.5'"
                />
              </button>
            </div>

            <div
              v-show="dofOpen"
              class="px-4 pb-4 flex flex-col gap-3 transition-opacity"
              :class="dofEnabled ? 'opacity-100' : 'opacity-35'"
            >
              <!-- Hint when enabled -->
              <p v-if="dofEnabled && sourceImage" class="font-fell text-[11px] text-muted-foreground italic">
                Click the image to set the focal point
              </p>

              <!-- Falloff curve pills -->
              <div class="flex items-center gap-1.5">
                <span class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase mr-1">Falloff</span>
                <button
                  v-for="curve in (['linear', 'quadratic', 'cubic'] as FalloffCurve[])"
                  :key="curve"
                  type="button"
                  class="font-cinzel text-[10px] tracking-wider px-2 py-0.5 rounded border transition-colors"
                  :class="dof.falloff === curve
                    ? 'border-primary text-primary'
                    : 'border-border hover:border-primary/60 hover:text-foreground text-muted-foreground'"
                  @click="dof.falloff = curve"
                >{{ curve }}</button>
              </div>

              <!-- Focus radius -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Focus radius</label>
                  <span class="font-fell text-xs text-muted-foreground tabular-nums">{{ Math.round(dof.focusRadius * 100) }}</span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.01"
                  :value="dof.focusRadius"
                  class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
                  @input="(e) => { dof.focusRadius = parseFloat((e.target as HTMLInputElement).value); }"
                />
              </div>

              <!-- Blur strength -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Blur</label>
                  <span class="font-fell text-xs text-muted-foreground tabular-nums">{{ Math.round(dof.blurStrength * 100) }}</span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.01"
                  :value="dof.blurStrength"
                  class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
                  @input="(e) => { dof.blurStrength = parseFloat((e.target as HTMLInputElement).value); }"
                />
              </div>

              <!-- Desaturation -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">Desaturation</label>
                  <span class="font-fell text-xs text-muted-foreground tabular-nums">{{ Math.round(dof.desaturation * 100) }}</span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.01"
                  :value="dof.desaturation"
                  class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
                  @input="(e) => { dof.desaturation = parseFloat((e.target as HTMLInputElement).value); }"
                />
              </div>
            </div>
          </div>

          <!-- ── Edge Treatment section (parent for all four edges) ──── -->
          <div class="border-t border-border">
            <!-- Parent header — no enable toggle, controlled per-edge -->
            <div
              class="flex items-center px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer select-none"
              @click="edgesOpen = !edgesOpen"
            >
              <ChevronRightIcon
                class="h-3 w-3 shrink-0 text-muted-foreground transition-transform mr-2"
                :class="edgesOpen ? 'rotate-90' : ''"
              />
              <span class="flex-1 font-cinzel text-xs font-bold tracking-widest uppercase text-foreground">
                Edge Treatment
              </span>
              <!-- Active edge count badge -->
              <span
                v-if="EDGE_KEYS.some(e => opts[e].enabled)"
                class="font-cinzel text-[10px] tracking-wider text-primary mr-2"
              >{{ EDGE_KEYS.filter(e => opts[e].enabled).length }} active</span>
            </div>

            <!-- Per-edge sub-sections -->
            <div v-show="edgesOpen">
              <div
                v-for="edge in EDGE_KEYS"
                :key="edge"
                class="border-t border-border/50"
              >
                <!-- Sub-header: indented, smaller chevron -->
                <div
                  class="flex items-center pl-8 pr-4 py-2.5 hover:bg-muted/40 transition-colors cursor-pointer select-none"
                  @click="edgeOpen[edge] = !edgeOpen[edge]"
                >
                  <ChevronRightIcon
                    class="h-2.5 w-2.5 shrink-0 text-muted-foreground transition-transform mr-2"
                    :class="edgeOpen[edge] ? 'rotate-90' : ''"
                  />
                  <span
                    class="flex-1 font-cinzel text-[10px] font-semibold tracking-widest uppercase transition-colors"
                    :class="opts[edge].enabled ? 'text-foreground' : 'text-muted-foreground'"
                  >{{ edge }}</span>
                  <button
                    type="button"
                    class="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors"
                    :class="opts[edge].enabled ? 'bg-primary' : 'bg-muted-foreground/30'"
                    @click.stop="opts[edge].enabled = !opts[edge].enabled"
                  >
                    <span
                      class="inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform"
                      :class="opts[edge].enabled ? 'translate-x-3.5' : 'translate-x-0.5'"
                    />
                  </button>
                </div>

                <!-- Sliders — dimmed when disabled -->
                <div
                  v-show="edgeOpen[edge]"
                  class="pl-8 pr-4 pb-4 flex flex-col gap-3 transition-opacity"
                  :class="opts[edge].enabled ? 'opacity-100' : 'opacity-35'"
                >
                  <div v-for="slider in SLIDERS" :key="slider.key">
                    <div class="flex items-center justify-between mb-1">
                      <label class="font-cinzel text-[10px] tracking-wider text-muted-foreground uppercase">
                        {{ slider.label }}
                      </label>
                      <span class="font-fell text-xs text-muted-foreground tabular-nums">
                        {{ sliderDisplay(edge, slider.key) }}
                      </span>
                    </div>
                    <input
                      type="range"
                      :min="slider.min"
                      :max="slider.max"
                      :step="slider.step"
                      :value="opts[edge][slider.key]"
                      class="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-border accent-primary"
                      @input="(e) => setSlider(edge, slider.key, parseFloat((e.target as HTMLInputElement).value))"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer: reset + export -->
          <div class="border-t border-border p-4 flex flex-col gap-2">
            <button
              type="button"
              class="font-cinzel text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors text-right mb-1"
              @click="resetDefaults"
            >Reset all to defaults</button>

            <button
              type="button"
              :disabled="!sourceImage || isExporting"
              class="flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold tracking-wider text-primary-foreground transition-opacity disabled:opacity-40"
              @click="downloadPng"
            >
              <DownloadIcon class="h-3.5 w-3.5 shrink-0" />
              {{ isExporting ? 'Processing…' : 'Download PNG' }}
            </button>

            <button
              type="button"
              :disabled="!sourceImage || isExporting || !clipboardSupported"
              class="flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 font-cinzel text-xs font-semibold tracking-wider text-foreground transition-colors hover:bg-muted disabled:opacity-40"
              @click="copyToClipboard"
            >
              <component :is="copySuccess ? CheckIcon : ClipboardIcon" class="h-3.5 w-3.5 shrink-0" />
              {{ copySuccess ? 'Copied!' : 'Copy to clipboard' }}
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, reactive, watch } from "vue";
import {
  Image as ImageIcon,
  Download as DownloadIcon,
  Clipboard as ClipboardIcon,
  Check as CheckIcon,
  ChevronRight as ChevronRightIcon,
} from "lucide-vue-next";
import PageHeader from "@/components/common/PageHeader.vue";
import {
  applyEdgeTreatmentToCtx,
  processImage,
  DEFAULT_EDGE_TREATMENT,
  type EdgeTreatmentOptions,
  type EdgeOptions,
} from "@/lib/edgeTreatment";
import {
  applyColourGrading,
  DEFAULT_COLOUR_GRADING,
  GRADING_PRESETS,
  type ColourGradingOptions,
} from "@/lib/colourGrading";
import {
  applyVignette,
  DEFAULT_VIGNETTE,
  type VignetteOptions,
  type VignetteMode,
} from "@/lib/vignette";
import {
  applyDofBlur,
  drawFocalCrosshair,
  DEFAULT_DOF_BLUR,
  type DofBlurOptions,
  type FalloffCurve,
} from "@/lib/dofBlur";
import {
  applyTextureOverlay,
  DEFAULT_TEXTURE_OVERLAY,
  BLEND_MODES,
  BLEND_MODE_LABELS,
  type TextureOverlayOptions,
} from "@/lib/textureOverlay";

// ─── State ────────────────────────────────────────────────────────────────────

const fileInput      = ref<HTMLInputElement | null>(null);
const previewCanvas  = ref<HTMLCanvasElement | null>(null);
const sourceImage    = ref<HTMLImageElement | null>(null);
const sourceFilename = ref("image");
const isDragging     = ref(false);
const isExporting    = ref(false);
const copySuccess    = ref(false);

const clipboardSupported =
  typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;

const opts = reactive<EdgeTreatmentOptions>(structuredClone(DEFAULT_EDGE_TREATMENT));

// Colour grading state
const gradingEnabled = ref(false);
const grading = reactive<ColourGradingOptions>(structuredClone(DEFAULT_COLOUR_GRADING));

// Vignette state
const vignetteEnabled = ref(false);
const vignette = reactive<VignetteOptions>(structuredClone(DEFAULT_VIGNETTE));

// DOF state
const dofEnabled = ref(false);
const dof = reactive<DofBlurOptions>(structuredClone(DEFAULT_DOF_BLUR));

// Texture overlay state
const textureEnabled   = ref(false);
const textureImage     = shallowRef<HTMLImageElement | null>(null);
const textureFilename  = ref("");
const textureFileInput = ref<HTMLInputElement | null>(null);
const texture = reactive<Omit<TextureOverlayOptions, "enabled">>(
  structuredClone({ blendMode: DEFAULT_TEXTURE_OVERLAY.blendMode, opacity: DEFAULT_TEXTURE_OVERLAY.opacity, scale: DEFAULT_TEXTURE_OVERLAY.scale }),
);

// Accordion open state — each section collapses independently from its enable toggle
const gradingOpen  = ref(false);
const vignetteOpen = ref(false);
const textureOpen  = ref(false);
const dofOpen      = ref(false);
const edgesOpen    = ref(false);
const edgeOpen     = reactive<Record<string, boolean>>({ top: false, right: false, bottom: false, left: false });

// ─── Config ───────────────────────────────────────────────────────────────────

const EDGE_KEYS = ["top", "right", "bottom", "left"] as const;
type EdgeKey   = typeof EDGE_KEYS[number];
type SliderKey = "roughness" | "fadeWidth" | "tearDepth" | "passes" | "variation";

const SLIDERS: Array<{ key: SliderKey; label: string; min: number; max: number; step: number }> = [
  { key: "roughness",  label: "Roughness",  min: 0,  max: 1,  step: 0.01 },
  { key: "fadeWidth",  label: "Fade width", min: 0,  max: 1,  step: 0.01 },
  { key: "tearDepth",  label: "Tear depth", min: 0,  max: 1,  step: 0.01 },
  { key: "passes",     label: "Passes",     min: 1,  max: 12, step: 1    },
  { key: "variation",  label: "Variation",  min: 0,  max: 1,  step: 0.01 },
];

type GradingSliderKey = keyof ColourGradingOptions;
const GRADING_SLIDERS: Array<{
  key: GradingSliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
  isHue: boolean;
}> = [
  { key: "brightness",  label: "Brightness", min: -1,   max: 1,   step: 0.01, isHue: false },
  { key: "contrast",    label: "Contrast",   min: -1,   max: 1,   step: 0.01, isHue: false },
  { key: "saturation",  label: "Saturation", min: -1,   max: 1,   step: 0.01, isHue: false },
  { key: "temperature", label: "Temp",       min: -1,   max: 1,   step: 0.01, isHue: false },
  { key: "hue",         label: "Hue",        min: -180, max: 180, step: 1,    isHue: true  },
];

function sliderDisplay(edge: EdgeKey, key: SliderKey): string {
  const v = opts[edge][key];
  return key === "passes" ? String(Math.round(v)) : String(Math.round(v * 100));
}

function setSlider(edge: EdgeKey, key: SliderKey, value: number): void {
  (opts[edge] as EdgeOptions)[key] = value;
}

function gradingDisplay(key: GradingSliderKey): string {
  const v = grading[key];
  if (key === "hue") {
    const deg = Math.round(v);
    return deg >= 0 ? `+${deg}°` : `${deg}°`;
  }
  const pct = Math.round(v * 100);
  return pct >= 0 ? `+${pct}` : String(pct);
}

function setGradingSlider(key: GradingSliderKey, value: number): void {
  (grading as ColourGradingOptions)[key] = value;
}

function applyPreset(values: ColourGradingOptions): void {
  Object.assign(grading, values);
  if (!gradingEnabled.value) gradingEnabled.value = true;
}

function resetGrading(): void {
  Object.assign(grading, structuredClone(DEFAULT_COLOUR_GRADING));
}

// ─── Image loading ────────────────────────────────────────────────────────────

function loadFile(file: File) {
  if (!file.type.startsWith("image/")) return;
  sourceFilename.value = file.name.replace(/\.[^.]+$/, "");
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    if (sourceImage.value) URL.revokeObjectURL(sourceImage.value.src);
    sourceImage.value = img;
  };
  img.src = url;
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) loadFile(file);
}

function onDrop(e: DragEvent) {
  isDragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) loadFile(file);
}

function clearImage() {
  if (sourceImage.value) URL.revokeObjectURL(sourceImage.value.src);
  sourceImage.value = null;
  if (fileInput.value) fileInput.value.value = "";
}

function loadTextureFile(file: File) {
  if (!file.type.startsWith("image/")) return;
  textureFilename.value = file.name.replace(/\.[^.]+$/, "");
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    if (textureImage.value) URL.revokeObjectURL(textureImage.value.src);
    textureImage.value = img;
    textureEnabled.value = true;
  };
  img.src = url;
}

function onTextureFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) loadTextureFile(file);
}

function onTextureDrop(e: DragEvent) {
  const file = e.dataTransfer?.files[0];
  if (file) loadTextureFile(file);
}

function clearTexture() {
  if (textureImage.value) URL.revokeObjectURL(textureImage.value.src);
  textureImage.value = null;
  textureFilename.value = "";
  textureEnabled.value = false;
  if (textureFileInput.value) textureFileInput.value.value = "";
}

// ─── Render ───────────────────────────────────────────────────────────────────

const MAX_PREVIEW = 900;

function renderPreview() {
  const img    = sourceImage.value;
  const canvas = previewCanvas.value;
  if (!img || !canvas) return;

  const scale = Math.min(1, MAX_PREVIEW / Math.max(img.naturalWidth, img.naturalHeight));
  const pw = Math.round(img.naturalWidth  * scale);
  const ph = Math.round(img.naturalHeight * scale);

  canvas.width  = pw;
  canvas.height = ph;

  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.clearRect(0, 0, pw, ph);
  ctx.drawImage(img, 0, 0, pw, ph);

  if (gradingEnabled.value) applyColourGrading(ctx, pw, ph, grading);
  if (dofEnabled.value) applyDofBlur(ctx, pw, ph, { ...dof, enabled: true });
  if (textureEnabled.value && textureImage.value) {
    applyTextureOverlay(ctx, pw, ph, { ...texture, enabled: true }, textureImage.value);
  }
  if (vignetteEnabled.value) applyVignette(ctx, pw, ph, { ...vignette, enabled: true });
  applyEdgeTreatmentToCtx(ctx, pw, ph, opts);

  // Crosshair drawn last — visible in preview only, not in export
  if (dofEnabled.value) drawFocalCrosshair(ctx, pw, ph, dof.focalX, dof.focalY);
}

let renderTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 60);
}

watch(opts, scheduleRender, { deep: true });
watch(grading, scheduleRender, { deep: true });
watch(gradingEnabled, scheduleRender);
watch(vignette, scheduleRender, { deep: true });
watch(vignetteEnabled, scheduleRender);
watch(dof, scheduleRender, { deep: true });
watch(dofEnabled, scheduleRender);
watch(texture, scheduleRender, { deep: true });
watch(textureEnabled, scheduleRender);
watch(textureImage, scheduleRender);
watch(sourceImage, () => { renderTimer = setTimeout(renderPreview, 0); });

// ─── Canvas interaction ───────────────────────────────────────────────────────

function onCanvasClick(e: MouseEvent) {
  if (!dofEnabled.value) return;
  const canvas = previewCanvas.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  dof.focalX = Math.max(0, Math.min(1, (e.clientX - rect.left)  / rect.width));
  dof.focalY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
}

// ─── Export ───────────────────────────────────────────────────────────────────

function buildGradingFn(): ((ctx: CanvasRenderingContext2D, w: number, h: number) => void) | undefined {
  if (!gradingEnabled.value) return undefined;
  const snapshot = { ...grading };
  return (ctx, w, h) => applyColourGrading(ctx, w, h, snapshot);
}

function buildDofFn(): ((ctx: CanvasRenderingContext2D, w: number, h: number) => void) | undefined {
  if (!dofEnabled.value) return undefined;
  const snapshot = { ...dof, enabled: true };
  return (ctx, w, h) => applyDofBlur(ctx, w, h, snapshot);
}

function buildVignetteFn(): ((ctx: CanvasRenderingContext2D, w: number, h: number) => void) | undefined {
  if (!vignetteEnabled.value) return undefined;
  const snapshot = { ...vignette, enabled: true };
  return (ctx, w, h) => applyVignette(ctx, w, h, snapshot);
}

function buildTextureFn(): ((ctx: CanvasRenderingContext2D, w: number, h: number) => void) | undefined {
  if (!textureEnabled.value || !textureImage.value) return undefined;
  const snapshot = { ...texture, enabled: true };
  const img = textureImage.value;
  return (ctx, w, h) => applyTextureOverlay(ctx, w, h, snapshot, img);
}

async function downloadPng() {
  if (!sourceImage.value || isExporting.value) return;
  isExporting.value = true;
  try {
    const blob = await processImage(sourceImage.value, opts, buildGradingFn(), buildDofFn(), buildVignetteFn(), buildTextureFn());
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${sourceFilename.value}-illuminated.png`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    isExporting.value = false;
  }
}

async function copyToClipboard() {
  if (!sourceImage.value || isExporting.value || !clipboardSupported) return;
  isExporting.value = true;
  try {
    const blob = await processImage(sourceImage.value, opts, buildGradingFn(), buildDofFn(), buildVignetteFn(), buildTextureFn());
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    copySuccess.value = true;
    setTimeout(() => { copySuccess.value = false; }, 2000);
  } finally {
    isExporting.value = false;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resetDefaults() {
  Object.assign(opts, structuredClone(DEFAULT_EDGE_TREATMENT));
  resetGrading();
  gradingEnabled.value = false;
  Object.assign(vignette, structuredClone(DEFAULT_VIGNETTE));
  vignetteEnabled.value = false;
  Object.assign(dof, structuredClone(DEFAULT_DOF_BLUR));
  dofEnabled.value = false;
  clearTexture();
  Object.assign(texture, { blendMode: DEFAULT_TEXTURE_OVERLAY.blendMode, opacity: DEFAULT_TEXTURE_OVERLAY.opacity, scale: DEFAULT_TEXTURE_OVERLAY.scale });
}
</script>
