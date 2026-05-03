<template>
  <PdfPreviewDialog
    :show="showPdfPreview"
    :blob-url="pdfBlobUrl"
    :title="title"
    @close="closePdfPreview"
    @save="savePdf"
  />
  <AssetInsertPanel
    :show="showAssetPanel"
    :editor="editor"
    :theme="theme"
    @close="showAssetPanel = false"
  />
  <BlockPickerPanel
    :show="showBlockPicker"
    :editor="editor"
    @close="showBlockPicker = false"
    @open-asset-panel="
      showBlockPicker = false;
      showAssetPanel = true;
    "
  />
  <CoverPageInspector
    :show="showCoverInspector"
    :editor="editor ?? null"
    @close="showCoverInspector = false"
  />

  <div class="flex flex-col gap-3 lg:h-full">
    <!-- Metadata row -->
    <div class="flex flex-wrap gap-2 items-end">
      <label class="flex-1 min-w-64">
        <span class="sr-only">Document title</span>
        <input
          v-model="title"
          placeholder="Document title…"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-base font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>
      <label>
        <span class="sr-only">Document type</span>
        <select
          v-model="docType"
          class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option v-for="t in DOC_TYPES" :key="t.value" :value="t.value">
            {{ t.label }}
          </option>
        </select>
      </label>
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" v-model="isPublished" class="rounded" />
        <span
          class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
          >PUBLISHED</span
        >
      </label>
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" v-model="showPageNumbers" class="rounded" />
        <span
          class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
          >PAGE #S</span
        >
      </label>
      <template v-if="showPageNumbers">
        <input
          v-model="footerText"
          placeholder="Footer text…"
          class="w-40 bg-card border border-border rounded-md px-2 py-1.5 font-fell text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <label class="flex items-center gap-1.5">
          <span
            class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider whitespace-nowrap"
            >START #</span
          >
          <input
            v-model.number="pageNumberStart"
            type="number"
            min="1"
            class="w-14 bg-card border border-border rounded-md px-2 py-1.5 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </label>
      </template>
      <button
        type="button"
        :disabled="isSaving || !title.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <Save class="h-3.5 w-3.5" />
        {{ isSaving ? "Saving…" : props.doc ? "Save" : "Create" }}
      </button>
      <button
        v-if="props.doc"
        type="button"
        :disabled="isDeleting"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive/50 px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        @click="destroy"
      >
        <Trash2 class="h-3.5 w-3.5" />
        {{ isDeleting ? "Deleting…" : "Delete" }}
      </button>
    </div>

    <!-- Tags row -->
    <TagInput v-model="tags" />

    <p v-if="saveError" class="text-destructive font-fell text-sm">
      {{ saveError }}
    </p>

    <!-- Editor / Preview split -->
    <!--
      Mobile: no min-height so the page scrolls naturally and both panes sit in
      the document flow. Desktop: fixed 620px pane height with internal scroll.
    -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:flex-1 lg:min-h-0">
      <!-- Editor pane -->
      <!--
        overflow-hidden only kicks in at lg: so the mobile layout doesn't clip the
        toolbar's horizontal scroll or trap the editor inside a nested scroller.
      -->
      <div
        class="flex flex-col rounded-lg border border-border bg-card lg:overflow-hidden"
      >
        <!--
          Toolbar — on mobile: single horizontally-scrollable row so all icon
          buttons stay reachable without wrapping into 3+ rows. Desktop: wrap.
        -->
        <div
          class="flex flex-nowrap items-center gap-0.5 p-1.5 border-b border-border bg-muted/30 shrink-0 overflow-x-auto scriptorium-toolbar lg:flex-wrap lg:overflow-visible"
        >
          <template v-if="editor">
            <!-- Inline -->
            <button
              type="button"
              title="Bold"
              :class="tbCls(editor.isActive('bold'))"
              @click="editor.chain().focus().toggleBold().run()"
            >
              <strong class="text-[11px] leading-none">B</strong>
            </button>
            <button
              type="button"
              title="Italic"
              :class="tbCls(editor.isActive('italic'))"
              @click="editor.chain().focus().toggleItalic().run()"
            >
              <em class="text-[11px] leading-none">I</em>
            </button>
            <button
              type="button"
              title="Strikethrough"
              :class="tbCls(editor.isActive('strike'))"
              @click="editor.chain().focus().toggleStrike().run()"
            >
              <Strikethrough class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Inline code"
              :class="tbCls(editor.isActive('code'))"
              @click="editor.chain().focus().toggleCode().run()"
            >
              <Code class="h-3.5 w-3.5" />
            </button>

            <div class="w-px h-5 bg-border mx-0.5" />

            <!-- Headings -->
            <button
              type="button"
              title="Heading 1"
              :class="tbCls(editor.isActive('heading', { level: 1 }))"
              @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
            >
              <span class="text-[10px] font-cinzel font-bold leading-none"
                >H1</span
              >
            </button>
            <button
              type="button"
              title="Heading 2"
              :class="tbCls(editor.isActive('heading', { level: 2 }))"
              @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
            >
              <span class="text-[10px] font-cinzel font-bold leading-none"
                >H2</span
              >
            </button>
            <button
              type="button"
              title="Heading 3"
              :class="tbCls(editor.isActive('heading', { level: 3 }))"
              @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
            >
              <span class="text-[10px] font-cinzel font-bold leading-none"
                >H3</span
              >
            </button>

            <div class="w-px h-5 bg-border mx-0.5" />

            <!-- Blocks -->
            <button
              type="button"
              title="Bullet list"
              :class="tbCls(editor.isActive('bulletList'))"
              @click="editor.chain().focus().toggleBulletList().run()"
            >
              <List class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Ordered list"
              :class="tbCls(editor.isActive('orderedList'))"
              @click="editor.chain().focus().toggleOrderedList().run()"
            >
              <ListOrdered class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Blockquote / callout"
              :class="tbCls(editor.isActive('blockquote'))"
              @click="editor.chain().focus().toggleBlockquote().run()"
            >
              <Quote class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Code block"
              :class="tbCls(editor.isActive('codeBlock'))"
              @click="editor.chain().focus().toggleCodeBlock().run()"
            >
              <SquareCode class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Wide Block (spans both columns)"
              :class="tbCls(editor.isActive('wideBlock'))"
              @click="editor.chain().focus().toggleWideBlock().run()"
            >
              <RectangleHorizontal class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Page Break (inserts new page)"
              :class="tbCls(false)"
              @click="editor.chain().focus().setHorizontalRule().run()"
            >
              <Minus class="h-3.5 w-3.5" />
            </button>

            <div class="w-px h-5 bg-border mx-0.5" />

            <!-- Insert Asset -->
            <button
              type="button"
              title="Insert asset as new page (NPC, Monster…)"
              :class="tbCls(false)"
              class="gap-1 px-2 font-cinzel text-[10px] font-semibold tracking-wider"
              @click="showAssetPanel = true"
            >
              <PackagePlus class="h-3.5 w-3.5" />
              Insert
            </button>

            <!-- Insert Block picker -->
            <button
              type="button"
              title="Insert block…"
              :class="tbCls(showBlockPicker)"
              class="gap-1 px-2 font-cinzel text-[10px] font-semibold tracking-wider"
              @click="showBlockPicker = true"
            >
              <LayoutGrid class="h-3.5 w-3.5" />
              Block
            </button>

            <div class="w-px h-5 bg-border mx-0.5" />

            <!-- Image controls (shown when an image is selected) -->
            <template v-if="editor.isActive('image')">
              <span
                class="font-cinzel text-[9px] text-muted-foreground tracking-wider px-1 self-center"
                >IMG</span
              >
              <button
                v-for="size in IMAGE_SIZES"
                :key="size.w"
                type="button"
                :title="`${size.label} (${size.w}px)`"
                :class="
                  tbCls(editor.getAttributes('image').width === String(size.w))
                "
                @click="
                  editor
                    .chain()
                    .focus()
                    .updateAttributes('image', { width: String(size.w) })
                    .run()
                "
              >
                <span class="font-cinzel text-[9px] font-bold leading-none">{{
                  size.label
                }}</span>
              </button>
              <div class="w-px h-5 bg-border mx-0.5" />
              <button
                type="button"
                title="Float left"
                :class="
                  tbCls(editor.getAttributes('image').dataAlign === 'left')
                "
                @click="
                  editor
                    .chain()
                    .focus()
                    .updateAttributes('image', {
                      dataAlign: 'left',
                      layoutMode: 'inline',
                    })
                    .run()
                "
              >
                <AlignLeft class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Center"
                :class="
                  tbCls(editor.getAttributes('image').dataAlign === 'center')
                "
                @click="
                  editor
                    .chain()
                    .focus()
                    .updateAttributes('image', {
                      dataAlign: 'center',
                      layoutMode: 'inline',
                    })
                    .run()
                "
              >
                <AlignCenter class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Float right"
                :class="
                  tbCls(
                    editor.getAttributes('image').dataAlign === 'right' ||
                      !editor.getAttributes('image').dataAlign,
                  )
                "
                @click="
                  editor
                    .chain()
                    .focus()
                    .updateAttributes('image', {
                      dataAlign: 'right',
                      layoutMode: 'inline',
                    })
                    .run()
                "
              >
                <AlignRight class="h-3.5 w-3.5" />
              </button>
              <div class="w-px h-5 bg-border mx-0.5" />
              <!-- Layout mode controls -->
              <span
                class="font-cinzel text-[9px] text-muted-foreground tracking-wider px-1 self-center"
                >LAYOUT</span
              >
              <button
                type="button"
                title="Wrap left — text flows around right edge"
                :class="
                  tbCls(editor.getAttributes('image').layoutMode === 'wrapLeft')
                "
                @click="
                  editor
                    .chain()
                    .focus()
                    .updateAttributes('image', { layoutMode: 'wrapLeft' })
                    .run()
                "
              >
                <WrapText class="h-3.5 w-3.5 scale-x-[-1]" />
              </button>
              <button
                type="button"
                title="Wrap right — text flows around left edge"
                :class="
                  tbCls(
                    editor.getAttributes('image').layoutMode === 'wrapRight',
                  )
                "
                @click="
                  editor
                    .chain()
                    .focus()
                    .updateAttributes('image', { layoutMode: 'wrapRight' })
                    .run()
                "
              >
                <WrapText class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Absolute position — pin image at exact page coordinates"
                :class="
                  tbCls(editor.getAttributes('image').layoutMode === 'absolute')
                "
                @click="
                  editor
                    .chain()
                    .focus()
                    .updateAttributes('image', {
                      layoutMode: 'absolute',
                      posTop: '60',
                      posLeft: '40',
                      posRight: null,
                      posBottom: null,
                    })
                    .run()
                "
              >
                <Pin class="h-3.5 w-3.5" />
              </button>
              <!-- Bleed-into-gutter toggle (wrap modes only) -->
              <template
                v-if="
                  editor.getAttributes('image').layoutMode === 'wrapLeft' ||
                  editor.getAttributes('image').layoutMode === 'wrapRight'
                "
              >
                <button
                  type="button"
                  title="Bleed into column gutter"
                  :class="
                    tbCls(editor.getAttributes('image').gutterBleed === true)
                  "
                  @click="
                    editor
                      .chain()
                      .focus()
                      .updateAttributes('image', {
                        gutterBleed: !editor.getAttributes('image').gutterBleed,
                      })
                      .run()
                  "
                >
                  <span class="font-cinzel text-[9px] font-bold leading-none"
                    >⇔</span
                  >
                </button>
              </template>
              <!-- Absolute position inputs (absolute mode only) -->
              <template
                v-if="editor.getAttributes('image').layoutMode === 'absolute'"
              >
                <div class="w-px h-5 bg-border mx-0.5" />
                <label class="flex items-center gap-0.5">
                  <span class="font-cinzel text-[9px] text-muted-foreground"
                    >T</span
                  >
                  <input
                    type="number"
                    :value="editor.getAttributes('image').posTop ?? ''"
                    min="0"
                    max="1200"
                    class="w-12 h-5.5 rounded border border-border bg-card px-1 font-mono text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="px"
                    @change="
                      editor
                        .chain()
                        .focus()
                        .updateAttributes('image', {
                          posTop:
                            ($event.target as HTMLInputElement).value || null,
                        })
                        .run()
                    "
                  />
                </label>
                <label class="flex items-center gap-0.5">
                  <span class="font-cinzel text-[9px] text-muted-foreground"
                    >L</span
                  >
                  <input
                    type="number"
                    :value="editor.getAttributes('image').posLeft ?? ''"
                    min="0"
                    max="800"
                    class="w-12 h-5.5 rounded border border-border bg-card px-1 font-mono text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="px"
                    @change="
                      editor
                        .chain()
                        .focus()
                        .updateAttributes('image', {
                          posLeft:
                            ($event.target as HTMLInputElement).value || null,
                        })
                        .run()
                    "
                  />
                </label>
                <label class="flex items-center gap-0.5">
                  <span class="font-cinzel text-[9px] text-muted-foreground"
                    >R</span
                  >
                  <input
                    type="number"
                    :value="editor.getAttributes('image').posRight ?? ''"
                    min="0"
                    max="800"
                    class="w-12 h-5.5 rounded border border-border bg-card px-1 font-mono text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="px"
                    @change="
                      editor
                        .chain()
                        .focus()
                        .updateAttributes('image', {
                          posRight:
                            ($event.target as HTMLInputElement).value || null,
                        })
                        .run()
                    "
                  />
                </label>
                <label class="flex items-center gap-0.5">
                  <span class="font-cinzel text-[9px] text-muted-foreground"
                    >B</span
                  >
                  <input
                    type="number"
                    :value="editor.getAttributes('image').posBottom ?? ''"
                    min="0"
                    max="1200"
                    class="w-12 h-5.5 rounded border border-border bg-card px-1 font-mono text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="px"
                    @change="
                      editor
                        .chain()
                        .focus()
                        .updateAttributes('image', {
                          posBottom:
                            ($event.target as HTMLInputElement).value || null,
                        })
                        .run()
                    "
                  />
                </label>
              </template>
              <!-- Edit in Illuminator — only for asset-images bucket URLs -->
              <template v-if="selectedImageIsSupabase && props.doc">
                <div class="w-px h-5 bg-border mx-0.5" />
                <button
                  type="button"
                  title="Edit in Illuminator"
                  :class="tbCls(false)"
                  @click="editInIlluminator"
                >
                  <ExternalLink class="h-3.5 w-3.5" />
                </button>
              </template>
            </template>

            <!-- Cover page controls (shown when a cover page is selected) -->
            <template v-if="editor.isActive('coverPage')">
              <div class="w-px h-5 bg-border mx-0.5" />
              <span
                class="font-cinzel text-[9px] text-muted-foreground tracking-wider px-1 self-center"
                >COVER</span
              >
              <button
                type="button"
                title="Edit cover page text"
                :class="tbCls(showCoverInspector)"
                class="gap-1 px-2 font-cinzel text-[10px] font-semibold tracking-wider"
                @click="showCoverInspector = true"
              >
                <PencilLine class="h-3.5 w-3.5" />
                Edit
              </button>
            </template>

            <!-- History -->
            <button
              type="button"
              title="Undo"
              :class="tbCls(false)"
              :disabled="!editor.can().undo()"
              @click="editor.chain().focus().undo().run()"
            >
              <Undo2 class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Redo"
              :class="tbCls(false)"
              :disabled="!editor.can().redo()"
              @click="editor.chain().focus().redo().run()"
            >
              <Redo2 class="h-3.5 w-3.5" />
            </button>

            <div class="w-px h-5 bg-border mx-0.5" />

            <!-- Layout -->
            <button
              type="button"
              title="Toggle two-column preview"
              :class="tbCls(isTwoColumn)"
              @click="isTwoColumn = !isTwoColumn"
            >
              <Columns2 class="h-3.5 w-3.5" />
            </button>

            <!-- Theme -->
            <div
              role="radiogroup"
              aria-label="Preview theme"
              class="ml-1 inline-flex rounded border border-border overflow-hidden shrink-0"
            >
              <button
                type="button"
                role="radio"
                :aria-checked="theme === 'onednd2024'"
                title="OneDnD 2024 theme"
                class="px-2 h-6.5 font-cinzel text-[9px] font-semibold tracking-wider uppercase transition-colors"
                :class="
                  theme === 'onednd2024'
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                "
                @click="theme = 'onednd2024'"
              >
                2024
              </button>
              <button
                type="button"
                role="radio"
                :aria-checked="theme === 'phb2014'"
                title="Classic PHB (2014) theme"
                class="px-2 h-6.5 font-cinzel text-[9px] font-semibold tracking-wider uppercase transition-colors border-l border-border"
                :class="
                  theme === 'phb2014'
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                "
                @click="theme = 'phb2014'"
              >
                Classic
              </button>
            </div>

            <div class="w-px h-5 bg-border mx-0.5" />

            <!-- Page size -->
            <div
              role="radiogroup"
              aria-label="Page size"
              class="ml-1 inline-flex rounded border border-border overflow-hidden shrink-0"
            >
              <button
                v-for="(sz, idx) in ['A4', 'A5', 'Letter'] as const"
                :key="sz"
                type="button"
                role="radio"
                :aria-checked="pageSize === sz"
                :title="`Page size: ${sz}`"
                class="px-2 h-6.5 font-cinzel text-[9px] font-semibold tracking-wider uppercase transition-colors"
                :class="[
                  idx > 0 ? 'border-l border-border' : '',
                  pageSize === sz
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                ]"
                @click="pageSize = sz"
              >
                {{ sz }}
              </button>
            </div>

            <!-- Ink-friendly toggle -->
            <button
              type="button"
              title="Ink-friendly export (strips backgrounds & decorations)"
              :class="tbCls(inkFriendly)"
              class="gap-1 px-2 font-cinzel text-[10px] font-semibold tracking-wider"
              @click="inkFriendly = !inkFriendly"
            >
              <Printer class="h-3.5 w-3.5" />
            </button>
          </template>
        </div>

        <!-- Tiptap content -->
        <!--
          Mobile: content grows with the document and the page scrolls — no
          nested scroll trap. Desktop: flex-1 + overflow-auto so the 620px pane
          owns its own scroll like before.
        -->
        <div class="p-4 lg:flex-1 lg:overflow-auto lg:min-h-0 relative">
          <EditorContent :editor="editor" class="phb-editor h-full" />

          <!-- AI Enhance bubble menu -->
          <BubbleMenu
            v-if="editor && showEnhanceButton"
            :editor="editor"
            :tippy-options="{ duration: 100 }"
          >
            <div class="flex items-center rounded-md border border-border bg-card shadow-lg overflow-hidden">
              <button
                type="button"
                :disabled="isEnhancing"
                class="flex items-center gap-1.5 px-2.5 py-1.5 font-cinzel text-[11px] font-semibold tracking-wide text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                @click="onEnhance"
              >
                <LoaderCircle v-if="isEnhancing" class="h-3 w-3 animate-spin" />
                <Wand2 v-else class="h-3 w-3" />
                Enhance
              </button>
            </div>
          </BubbleMenu>

          <!-- Inline error feedback -->
          <Transition name="enhance-error">
            <div
              v-if="enhanceError"
              class="absolute bottom-2 left-2 right-2 z-30 rounded-md bg-destructive/90 px-3 py-2 font-fell text-xs text-white shadow-lg"
            >
              {{ enhanceError }}
            </div>
          </Transition>
        </div>

        <!-- Word count footer -->
        <div
          class="px-4 py-1.5 border-t border-border bg-muted/20 flex justify-end shrink-0"
        >
          <span class="font-fell text-[11px] text-muted-foreground italic"
            >{{ wordCount }} words</span
          >
        </div>
      </div>

      <!-- Preview pane — bg matches .phb-bg so macOS rubber-band bounce shows the same gray -->
      <div
        class="flex flex-col rounded-lg border border-border lg:overflow-hidden"
        style="background: #a09a90"
      >
        <div
          class="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0"
        >
          <p
            class="font-cinzel text-xs font-semibold text-muted-foreground uppercase tracking-widest"
          >
            Preview — {{ themeLabel }}
          </p>
          <div class="flex items-center gap-2">
            <span
              class="px-1.5 py-0.5 rounded font-cinzel text-[10px] font-bold tracking-wider uppercase"
              :style="{
                backgroundColor: typeColor(docType) + '22',
                color: typeColor(docType),
              }"
            >
              {{ DOC_TYPE_LABELS[docType] }}
            </span>

            <!-- Zoom controls — behaves like a PDF viewer -->
            <div class="flex items-center rounded border border-border overflow-hidden">
              <button
                type="button"
                title="Zoom out"
                :disabled="effectiveZoom <= 0.25"
                class="px-1.5 h-6.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                @click="zoomOut"
              >
                <ZoomOut class="h-3 w-3" />
              </button>
              <!-- Centre button: shows current zoom %; click to snap back to fit-to-width -->
              <button
                type="button"
                :title="zoomMode === 'fit' ? 'Fit to width' : 'Click to fit to width'"
                class="px-1.5 h-6.5 font-cinzel text-[9px] font-semibold tracking-wider border-x border-border transition-colors min-w-9.5 text-center"
                :class="zoomMode === 'fit' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
                @click="zoomFit"
              >
                {{ zoomMode === 'fit' ? 'Fit' : zoomLabel }}
              </button>
              <button
                type="button"
                title="Zoom in"
                :disabled="effectiveZoom >= 2.0"
                class="px-1.5 h-6.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                @click="zoomIn"
              >
                <ZoomIn class="h-3 w-3" />
              </button>
            </div>

            <button
              type="button"
              title="Export as PDF"
              :disabled="isGeneratingPdf"
              class="inline-flex items-center gap-1 px-2 py-1 rounded font-cinzel text-[10px] font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors tracking-wider uppercase disabled:opacity-50 disabled:cursor-not-allowed"
              @click="exportPdf"
            >
              <Loader2 v-if="isGeneratingPdf" class="h-3 w-3 animate-spin" />
              <FileDown v-else class="h-3 w-3" />
              {{ isGeneratingPdf ? "Building…" : "PDF" }}
            </button>
          </div>
        </div>
        <div ref="previewContainerRef" class="phb-bg lg:flex-1 lg:overflow-auto lg:min-h-0" style="touch-action: pan-x pan-y;">
          <!-- Wrapper gives the scroll container the correct zoomed dimensions.
               The inner .phb-page uses transform:scale so layout is unaffected
               by zoom (CSS `zoom` runs after flex layout and breaks scroll). -->
          <div
            v-for="(pageHtml, pageIndex) in pages"
            :key="pageIndex"
            :style="pageWrapperStyle"
          >
            <div
              class="phb-page"
              :class="[themeClass, { 'ink-friendly': inkFriendly }]"
              :style="pageInnerStyle"
            >
              <div
                class="phb-body"
                :class="[themeClass, { 'phb-two-col': isTwoColumn }]"
                v-html="pageHtml"
              />
              <!-- Odd index = recto (right-hand page): # on right. Even index = verso (left-hand page): # on left. -->
              <div v-if="pageFooters[pageIndex] !== null" class="sc-footer" :class="pageIndex % 2 === 0 ? 'sc-footer--recto' : 'sc-footer--verso'">
                <span class="sc-footer-num sc-footer-num--left">{{ pageFooters[pageIndex] }}</span>
                <span class="sc-footer-text">{{ footerText }}</span>
                <span class="sc-footer-num sc-footer-num--right">{{ pageFooters[pageIndex] }}</span>
              </div>
            </div>
          </div>
          <p class="phb-hint">
            ── use the Page Break button (—) to start a new page ──
          </p>
        </div>
      </div>
    </div>
  </div>

  <PaywallModal v-model="showPaywall" resource="scriptorium_documents" />
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import { BubbleMenu } from "@tiptap/vue-3/menus";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import {
  Save,
  Strikethrough,
  Code,
  SquareCode,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo2,
  Redo2,
  FileDown,
  Loader2,
  PackagePlus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  Columns2,
  LayoutGrid,
  Printer,
  RectangleHorizontal,
  WrapText,
  Pin,
  ZoomIn,
  ZoomOut,
  Wand2,
  LoaderCircle,
  ExternalLink,
  PencilLine,
} from "lucide-vue-next";
import {
  useCreateScriptoriumDocument,
  useUpdateScriptoriumDocument,
  useDeleteScriptoriumDocument,
} from "@/composables/useScriptorium";
import {
  removeRichTextImages,
  cleanupRemovedRichTextImages,
} from "@/composables/useImageUpload";
import { useScriptoriumPdf } from "@/composables/useScriptoriumPdf";
import { SpacerVertical } from "@/lib/tiptap/SpacerVertical";
import { SpacerHorizontal } from "@/lib/tiptap/SpacerHorizontal";
import { Watercolor } from "@/lib/tiptap/watercolor";
import { Watermark } from "@/lib/tiptap/watermark";
import { ArtistCredit } from "@/lib/tiptap/artistCredit";
import { ColumnBreak } from "@/lib/tiptap/columnBreak";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { SkipCounting } from "@/lib/tiptap/skipCounting";
import { ResetCounting } from "@/lib/tiptap/resetCounting";
import { WideBlock } from "@/lib/tiptap/wideBlock";
import { NoteBlock } from "@/lib/tiptap/noteBlock";
import { DescriptiveBlock } from "@/lib/tiptap/descriptiveBlock";
import { QuoteBlock } from "@/lib/tiptap/quoteBlock";
import { Attribution } from "@/lib/tiptap/attribution";
import { TocBlock, buildTocPages } from "@/lib/tiptap/tocBlock";
import { CoverPage } from "@/lib/tiptap/coverPage";
import type {
  ScriptoriumDocument,
  ScriptoriumDocType,
  ScriptoriumTheme,
  ScriptoriumPageSize,
} from "@/types/scriptorium.types";
import PdfPreviewDialog from "@/components/scriptorium/PdfPreviewDialog.vue";
import AssetInsertPanel from "@/components/scriptorium/AssetInsertPanel.vue";
import BlockPickerPanel from "@/components/scriptorium/BlockPickerPanel.vue";
import CoverPageInspector from "@/components/scriptorium/CoverPageInspector.vue";
import TagInput from "@/components/common/TagInput.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { isQuotaExceeded } from "@/lib/quotaError";
import { useTextEnhancement } from "@/ai/useTextEnhancement";
import { parseMarkdown } from "@/lib/markdownToTiptap";

const IMAGE_SIZES = [
  { label: "S", w: 120 },
  { label: "M", w: 200 },
  { label: "L", w: 280 },
  { label: "XL", w: 380 },
] as const;

const DOC_TYPES: { value: ScriptoriumDocType; label: string }[] = [
  { value: "custom", label: "Custom" },
  { value: "spell", label: "Spell" },
  { value: "monster", label: "Monster" },
  { value: "item", label: "Item" },
  { value: "class", label: "Class" },
  { value: "subclass", label: "Subclass" },
  { value: "race", label: "Species" },
  { value: "background", label: "Background" },
  { value: "adventure", label: "Adventure" },
  { value: "npc-sheet", label: "NPC Sheet" },
  { value: "location", label: "Location" },
];

const DOC_TYPE_LABELS: Record<ScriptoriumDocType, string> = {
  custom: "Custom",
  spell: "Spell",
  monster: "Monster",
  item: "Item",
  class: "Class",
  subclass: "Subclass",
  race: "Species",
  background: "Background",
  adventure: "Adventure",
  "npc-sheet": "NPC Sheet",
  location: "Location",
  quest: "Quest",
};

const DOC_TYPE_COLORS: Record<ScriptoriumDocType, string> = {
  custom: "#6b7280",
  spell: "#7c3aed",
  monster: "#dc2626",
  item: "#d97706",
  class: "#2563eb",
  subclass: "#0891b2",
  race: "#059669",
  background: "#9333ea",
  adventure: "#c2410c",
  "npc-sheet": "#0f766e",
  location: "#0369a1",
  quest: "#b45309",
};

function typeColor(t: ScriptoriumDocType) {
  return DOC_TYPE_COLORS[t] ?? "#6b7280";
}
function tbCls(active: boolean) {
  return [
    "p-1 rounded min-w-[26px] h-[26px] flex items-center justify-center transition-colors disabled:opacity-40",
    active
      ? "bg-primary/20 text-primary"
      : "text-muted-foreground hover:text-foreground hover:bg-muted",
  ].join(" ");
}

const props = defineProps<{ doc: ScriptoriumDocument | null }>();
const router = useRouter();
const route  = useRoute();

const ASSET_IMAGE_URL_BASE = (import.meta.env.VITE_SUPABASE_URL as string) + "/storage/v1/object/public/asset-images/";

const selectedImageIsSupabase = computed(() => {
  if (!editor.value?.isActive("image")) return false;
  const src = editor.value.getAttributes("image").src;
  return typeof src === "string" && src.startsWith(ASSET_IMAGE_URL_BASE);
});

// Panels
const showAssetPanel = ref(false);
const showBlockPicker = ref(false);
const showCoverInspector = ref(false);

// Metadata
const title = ref(props.doc?.title ?? "");
const docType = ref<ScriptoriumDocType>(props.doc?.doc_type ?? "custom");
const isPublished = ref(props.doc?.is_published ?? false);
const isTwoColumn = ref(props.doc?.is_two_column ?? false);
const theme = ref<ScriptoriumTheme>(props.doc?.theme ?? "onednd2024");
const pageSize = ref<ScriptoriumPageSize>(props.doc?.page_size ?? "A4");
const inkFriendly = ref(props.doc?.ink_friendly ?? false);
const tags = ref<string[]>(props.doc?.tags ?? []);
const showPageNumbers = ref(props.doc?.show_page_numbers ?? false);
const footerText = ref(props.doc?.footer_text ?? "");
const pageNumberStart = ref(props.doc?.page_number_start ?? 1);

const themeClass = computed(() =>
  theme.value === "phb2014" ? "theme-phb2014" : "theme-onednd2024",
);
const themeLabel = computed(() =>
  theme.value === "phb2014" ? "Classic PHB (2014)" : "OneDnD 2024",
);

// Physical page dimensions at 96 dpi — matches PAGE_SIZES in useScriptoriumPdf.ts exactly.
// Using the same pixel dimensions in both preview and PDF is what makes them WYSIWYG.
const PAGE_SIZES_PX: Record<ScriptoriumPageSize, { w: number; h: number }> = {
  A4: { w: 794, h: 1123 },
  A5: { w: 559, h: 794 },
  Letter: { w: 816, h: 1056 },
} as const;

// Track the preview container width so we can zoom pages to fit.
const previewContainerRef = ref<HTMLElement | null>(null);
const previewContainerWidth = ref(0);
let resizeObserver: ResizeObserver | null = null;
// Keep a direct reference for the cleanup in onUnmounted (ref may be null by then).
let previewEl: HTMLElement | null = null;
let wheelHandler: ((e: WheelEvent) => void) | null = null;
let pinchStartHandler: ((e: TouchEvent) => void) | null = null;
let pinchMoveHandler: ((e: TouchEvent) => void) | null = null;
let pinchStartDist = 0;
let pinchStartZoom = 0;

function pinchDist(t: TouchList): number {
  const dx = t[0].clientX - t[1].clientX;
  const dy = t[0].clientY - t[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

onMounted(() => {
  if (!previewContainerRef.value) return;
  previewEl = previewContainerRef.value;

  resizeObserver = new ResizeObserver((entries) => {
    previewContainerWidth.value = entries[0].contentRect.width;
  });
  resizeObserver.observe(previewEl);

  // Block swipe-to-back/forward navigation at horizontal scroll boundaries.
  // overscroll-behavior: contain only works when the element has overflow to absorb;
  // at fit zoom there is no horizontal overflow so the gesture leaks through to the browser.
  // A non-passive wheel listener intercepts purely horizontal swipes and blocks them
  // at the left/right boundary regardless of overflow state.
  wheelHandler = (e: WheelEvent) => {
    // ctrlKey is set by browsers for pinch-to-zoom gestures (iOS Safari, macOS trackpad).
    // Intercept here so we zoom the page content instead of the browser viewport.
    if (e.ctrlKey) {
      e.preventDefault();
      const factor = 1 - e.deltaY * 0.008; // sensitivity tuned for trackpad + iOS
      const newZoom = Math.min(2.0, Math.max(0.25, effectiveZoom.value * factor));
      manualZoom.value = newZoom;
      zoomMode.value = "manual";
      return;
    }
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical — let it pass
    // Always intercept horizontal scroll and apply it manually so the browser
    // never sees it as a navigation swipe, even on a fast flick.
    e.preventDefault();
    previewEl!.scrollLeft += e.deltaX;
  };
  previewEl.addEventListener("wheel", wheelHandler, { passive: false });

  // Pinch-to-zoom: record the starting finger distance and zoom level on
  // two-finger touch, then scale manualZoom proportionally on touchmove.
  pinchStartHandler = (e: TouchEvent) => {
    if (e.touches.length !== 2) return;
    pinchStartDist = pinchDist(e.touches);
    pinchStartZoom = effectiveZoom.value;
  };
  pinchMoveHandler = (e: TouchEvent) => {
    if (e.touches.length !== 2) return;
    e.preventDefault(); // prevent browser native zoom
    const d = pinchDist(e.touches);
    if (pinchStartDist === 0) return;
    const clamped = Math.min(2.0, Math.max(0.25, pinchStartZoom * (d / pinchStartDist)));
    manualZoom.value = clamped;
    zoomMode.value = "manual";
  };
  previewEl.addEventListener("touchstart", pinchStartHandler, { passive: true });
  previewEl.addEventListener("touchmove", pinchMoveHandler, { passive: false });
});

// ── Zoom controls ────────────────────────────────────────────────────────────
// 'fit' tracks the container width automatically; 'manual' uses a fixed step.
const zoomMode = ref<"fit" | "manual">("fit");
const manualZoom = ref(1.0);
const ZOOM_STEPS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0] as const;

const autoZoom = computed(() => {
  const { w } = PAGE_SIZES_PX[pageSize.value];
  const available = previewContainerWidth.value > 0 ? previewContainerWidth.value - 32 : w;
  return Math.min(1, available / w);
});

const effectiveZoom = computed(() =>
  zoomMode.value === "fit" ? autoZoom.value : manualZoom.value,
);

const zoomLabel = computed(() => `${Math.round(effectiveZoom.value * 100)}%`);

function zoomIn() {
  const cur = effectiveZoom.value;
  const next = ZOOM_STEPS.find((s) => s > cur + 0.01);
  if (next !== undefined) { manualZoom.value = next; zoomMode.value = "manual"; }
}
function zoomOut() {
  const cur = effectiveZoom.value;
  const prev = [...ZOOM_STEPS].reverse().find((s) => s < cur - 0.01);
  if (prev !== undefined) { manualZoom.value = prev; zoomMode.value = "manual"; }
}
function zoomFit() { zoomMode.value = "fit"; }

// Wrapper: gives the scroll container the correct zoomed layout dimensions.
// Inner page uses transform:scale — layout-neutral, just visual scaling.
// (CSS `zoom` runs after flex layout and doesn't update scroll dimensions.)
const pageWrapperStyle = computed(() => {
  const { w, h } = PAGE_SIZES_PX[pageSize.value];
  const z = effectiveZoom.value;
  return {
    width: `${Math.round(w * z)}px`,
    height: `${Math.round(h * z)}px`,
    flexShrink: '0',
    margin: '0 auto',
  };
});

const pageInnerStyle = computed(() => {
  const { w, h } = PAGE_SIZES_PX[pageSize.value];
  const z = effectiveZoom.value;
  return {
    width: `${w}px`,
    height: `${h}px`,
    transform: `scale(${z})`,
    transformOrigin: 'top left',
  };
});

// Editor
const previewHtml = ref("");
const wordCount = ref(0);

function updateDerived(html: string, text: string) {
  previewHtml.value = html;
  wordCount.value = text.trim() ? text.trim().split(/\s+/).length : 0;
}

const editor = useEditor({
  content: (() => {
    if (!props.doc?.content) return "";
    try {
      return JSON.parse(props.doc.content);
    } catch {
      return props.doc.content;
    }
  })(),
  extensions: [
    StarterKit,
    Placeholder.configure({ placeholder: "Begin your document here…" }),
    Image.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          // Explicit pixel width — html2canvas needs the attribute, not just CSS
          width: {
            default: "200",
            parseHTML: (el) => el.getAttribute("width") ?? "200",
            renderHTML: (attrs) => ({ width: attrs.width }),
          },
          // Alignment drives the inline style (float / centering)
          dataAlign: {
            default: "right",
            parseHTML: (el) => {
              const s = el.getAttribute("style") ?? "";
              if (s.includes("float:left")) return "left";
              if (s.includes("margin:8px auto")) return "center";
              return "right";
            },
            renderHTML: (attrs) => {
              const parts: string[] = [];
              if (attrs.dataAlign === "right")
                parts.push("float:right;margin:0 0 10px 14px");
              else if (attrs.dataAlign === "left")
                parts.push("float:left;margin:0 14px 10px 0");
              else if (attrs.dataAlign === "center")
                parts.push("display:block;margin:8px auto");
              if (attrs.width) parts.push(`width:${attrs.width}px`);
              return { style: parts.join(";") };
            },
          },
          // Layout mode: inline (default, uses dataAlign float), wrapLeft, wrapRight, absolute
          layoutMode: {
            default: "inline",
            parseHTML: (el) => el.getAttribute("data-layout-mode") ?? "inline",
            renderHTML: (attrs) => ({
              "data-layout-mode": attrs.layoutMode ?? "inline",
            }),
          },
          // Gutter bleed: extends wrap image into the column gutter (-3cm / ~-114px)
          gutterBleed: {
            default: false,
            parseHTML: (el) => el.getAttribute("data-gutter-bleed") === "true",
            renderHTML: (attrs) => ({
              "data-gutter-bleed": attrs.gutterBleed ? "true" : "false",
            }),
          },
          // Absolute-position offsets (stored as CSS value strings, e.g. "60px")
          posTop: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-pos-top") ?? null,
            renderHTML: (attrs) =>
              attrs.posTop ? { "data-pos-top": attrs.posTop } : {},
          },
          posLeft: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-pos-left") ?? null,
            renderHTML: (attrs) =>
              attrs.posLeft ? { "data-pos-left": attrs.posLeft } : {},
          },
          posRight: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-pos-right") ?? null,
            renderHTML: (attrs) =>
              attrs.posRight ? { "data-pos-right": attrs.posRight } : {},
          },
          posBottom: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-pos-bottom") ?? null,
            renderHTML: (attrs) =>
              attrs.posBottom ? { "data-pos-bottom": attrs.posBottom } : {},
          },
        };
      },
      // Override renderHTML to emit a wrapper div for wrapLeft/wrapRight/absolute
      // so the CSS classes land on a block-level element rather than the <img> itself.
      renderHTML({ HTMLAttributes }) {
        const mode: string = HTMLAttributes["data-layout-mode"] ?? "inline";
        if (mode === "inline") {
          // Default behaviour — just an <img> with inline style from dataAlign
          return ["img", HTMLAttributes];
        }
        // Build wrapper class list
        const wrapperClass = [
          "sc-img-wrap",
          `sc-img-wrap--${mode}`,
          HTMLAttributes["data-gutter-bleed"] === "true"
            ? "sc-img-wrap--gutter"
            : "",
        ]
          .filter(Boolean)
          .join(" ");

        // Build wrapper style for absolute mode
        const wrapperStyle: string[] = [];
        if (mode === "absolute") {
          if (HTMLAttributes["data-pos-top"])
            wrapperStyle.push(`top:${HTMLAttributes["data-pos-top"]}`);
          if (HTMLAttributes["data-pos-left"])
            wrapperStyle.push(`left:${HTMLAttributes["data-pos-left"]}`);
          if (HTMLAttributes["data-pos-right"])
            wrapperStyle.push(`right:${HTMLAttributes["data-pos-right"]}`);
          if (HTMLAttributes["data-pos-bottom"])
            wrapperStyle.push(`bottom:${HTMLAttributes["data-pos-bottom"]}`);
          if (HTMLAttributes.width)
            wrapperStyle.push(`width:${HTMLAttributes.width}px`);
        }

        // Strip style from img attrs in wrap/absolute mode (wrapper owns layout)
        const imgAttrs = { ...HTMLAttributes };
        delete imgAttrs.style;

        return [
          "div",
          {
            class: wrapperClass,
            ...(wrapperStyle.length ? { style: wrapperStyle.join(";") } : {}),
          },
          ["img", imgAttrs],
        ];
      },
    }).configure({ inline: false, allowBase64: false }),
    SpacerVertical,
    SpacerHorizontal,
    Watercolor,
    Watermark,
    ArtistCredit,
    ColumnBreak,
    Table.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          class: {
            default: null,
            parseHTML: (el) => el.getAttribute("class") ?? null,
            renderHTML: (attrs) => (attrs.class ? { class: attrs.class } : {}),
          },
        };
      },
    }).configure({ resizable: false }),
    TableRow,
    TableCell.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          class: {
            default: null,
            parseHTML: (el) => el.getAttribute("class") ?? null,
            renderHTML: (attrs) => (attrs.class ? { class: attrs.class } : {}),
          },
        };
      },
    }),
    TableHeader.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          class: {
            default: null,
            parseHTML: (el) => el.getAttribute("class") ?? null,
            renderHTML: (attrs) => (attrs.class ? { class: attrs.class } : {}),
          },
        };
      },
    }),
    SkipCounting,
    ResetCounting,
    WideBlock,
    NoteBlock,
    DescriptiveBlock,
    QuoteBlock,
    Attribution,
    TocBlock,
    CoverPage,
  ],
  onCreate({ editor }) {
    updateDerived(editor.getHTML(), editor.getText());
  },
  onUpdate({ editor }) {
    updateDerived(editor.getHTML(), editor.getText());
  },
});

// Save
const { mutateAsync: create } = useCreateScriptoriumDocument();
const { mutateAsync: update } = useUpdateScriptoriumDocument();
const { mutateAsync: deleteDoc } = useDeleteScriptoriumDocument();
const isSaving = ref(false);
const showPaywall = ref(false);
const isDeleting = ref(false);
const saveError = ref("");

// ─── Illuminator round-trip ───────────────────────────────────────────────────

function editInIlluminator() {
  if (!editor.value || !props.doc) return;
  const src = editor.value.getAttributes("image").src as string | undefined;
  if (!src || !src.startsWith(ASSET_IMAGE_URL_BASE)) return;
  const params = new URLSearchParams({
    src: src,
    returnTo: props.doc.id,
    oldSrc: src,
  });
  void router.push(`/illuminate?${params.toString()}`);
}

// Apply a replaced image URL when returning from Illuminator via query params.
watch(editor, (ed) => {
  if (!ed) return;
  const updatedSrc = typeof route.query.updatedSrc === "string" ? route.query.updatedSrc : null;
  const oldSrc     = typeof route.query.oldSrc     === "string" ? decodeURIComponent(route.query.oldSrc) : null;
  if (!updatedSrc || !oldSrc) return;

  let nodePos = -1;
  ed.state.doc.descendants((node, pos) => {
    if (nodePos !== -1) return false;
    if (node.type.name === "image" && node.attrs.src === oldSrc) {
      nodePos = pos;
    }
  });
  if (nodePos !== -1) {
    ed.chain().setNodeSelection(nodePos).updateAttributes("image", { src: updatedSrc }).run();
  }
  void router.replace({ query: {} });
}, { immediate: true });

async function destroy() {
  if (!props.doc) return;
  if (!(await confirm(`Delete "${props.doc.title}"? This cannot be undone.`)))
    return;
  isDeleting.value = true;
  const oldContent = props.doc.content;
  try {
    await deleteDoc(props.doc.id);
    removeRichTextImages(oldContent);
    router.replace("/scriptorium");
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to delete";
    isDeleting.value = false;
  }
}

async function save() {
  if (!title.value.trim()) return;
  isSaving.value = true;
  saveError.value = "";
  try {
    const payload = {
      title: title.value.trim(),
      content: JSON.stringify(editor.value?.getJSON() ?? {}),
      doc_type: docType.value,
      tags: tags.value,
      is_published: isPublished.value,
      is_two_column: isTwoColumn.value,
      theme: theme.value,
      page_size: pageSize.value,
      ink_friendly: inkFriendly.value,
      word_count: wordCount.value,
      show_page_numbers: showPageNumbers.value,
      footer_text: footerText.value,
      page_number_start: pageNumberStart.value,
    };
    if (props.doc) {
      const oldContent = props.doc.content;
      await update({ id: props.doc.id, update: payload });
      cleanupRemovedRichTextImages(oldContent, payload.content);
    } else {
      const created = await create(payload);
      router.replace(`/scriptorium/${created.id}`);
    }
  } catch (e: unknown) {
    if (isQuotaExceeded(e)) { showPaywall.value = true; return; }
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    isSaving.value = false;
  }
}

// Split rendered HTML into pages at every <hr> (Page Break),
// then run the TOC pre-pass so any sc-toc-placeholder becomes a live TOC.
const pages = computed(() => {
  const html = previewHtml.value || "";
  const parts = html.split(/<hr\s*\/?\s*>/gi);
  while (parts.length > 1 && !parts[0].trim()) parts.shift();
  while (parts.length > 1 && !parts[parts.length - 1].trim()) parts.pop();
  const rawPages = parts.length ? parts : [""];
  return buildTocPages(rawPages);
});

// Page-number counter logic shared between preview and PDF
// Returns the footer label for each page index, or null if that page is unnumbered.
// Pages containing a front or back cover page suppress the footer.
const pageFooters = computed<(string | null)[]>(() => {
  if (!showPageNumbers.value) return pages.value.map(() => null);

  const skipTag = 'data-type="skip-counting"';
  const resetTag = 'data-type="reset-counting"';
  let counter = pageNumberStart.value;
  return pages.value.map((html, _idx) => {
    // Front and back cover variants suppress the footer
    if (
      html.includes('data-type="coverPage"') &&
      (html.includes('data-variant="front"') ||
        html.includes('data-variant="back"'))
    ) {
      return null;
    }
    const hasSkip = html.includes(skipTag);
    const hasReset = html.includes(resetTag);
    if (hasReset) counter = pageNumberStart.value;
    if (hasSkip) return null; // omit + don't advance
    const label = String(counter);
    counter++;
    return label;
  });
});

const {
  showPdfPreview,
  pdfBlobUrl,
  isGeneratingPdf,
  exportPdf,
  savePdf,
  closePdfPreview,
} = useScriptoriumPdf(
  pages,
  title,
  theme,
  pageSize,
  inkFriendly,
  pageFooters,
  footerText,
);

// ── AI text enhancement ───────────────────────────────────────────────────────

const SCRIPTORIUM_STYLE: Partial<Record<ScriptoriumDocType, string>> = {
  spell:      "2024 Player's Handbook spell description: present tense, mechanical precision, second-person address ('you'). No preamble.",
  monster:    "2024 Monster Manual lore: third-person, atmospheric, present tense. One to two paragraphs.",
  item:       "2024 Dungeon Master's Guide item entry: one evocative flavour sentence followed by concise property text.",
  adventure:  "D&D read-aloud boxed text or DM narrative: infer register from surrounding content. Present tense.",
  background: "2024 Player's Handbook background feature: one paragraph, present tense, describes what the character can do.",
  location:   "D&D sourcebook location description: open with the most striking sensory detail, present tense, two paragraphs.",
  class:      "2024 Player's Handbook class feature: 'At Nth level, you gain…' voice, present tense, precise.",
  subclass:   "2024 Player's Handbook subclass feature description, same voice as class features.",
  race:       "2024 Player's Handbook species description: third-person, present tense, one to two paragraphs.",
};

const CONTEXT_RADIUS = 300;

const { isEnhancing, hasTextProvider, enhance } = useTextEnhancement();
const enhanceError = ref<string | null>(null);

const showEnhanceButton = computed(() => hasTextProvider());

async function onEnhance() {
  if (!editor.value || isEnhancing.value) return;
  const { from, to } = editor.value.state.selection;
  if (from === to) return;

  const selectedText = editor.value.state.doc.textBetween(from, to, " ");
  if (!selectedText.trim()) return;

  const docSize = editor.value.state.doc.content.size;
  const before = editor.value.state.doc.textBetween(Math.max(0, from - CONTEXT_RADIUS), from, " ");
  const after = editor.value.state.doc.textBetween(to, Math.min(docSize, to + CONTEXT_RADIUS), " ");
  const surroundingContext = [before, "[[SELECTION]]", after].filter(Boolean).join(" ");

  enhanceError.value = null;
  try {
    const markdown = await enhance(selectedText, "Scriptorium document", {
      styleHint: SCRIPTORIUM_STYLE[docType.value],
      surroundingContext: surroundingContext.trim() || undefined,
    });
    const nodes = parseMarkdown(markdown);
    editor.value
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, nodes, { parseOptions: { preserveWhitespace: false } })
      .run();
  } catch (e) {
    enhanceError.value = e instanceof Error ? e.message : "Enhancement failed";
    setTimeout(() => { enhanceError.value = null; }, 4000);
  }
}

onUnmounted(() => {
  editor.value?.destroy();
  resizeObserver?.disconnect();
  if (previewEl) {
    if (wheelHandler) previewEl.removeEventListener("wheel", wheelHandler);
    if (pinchStartHandler) previewEl.removeEventListener("touchstart", pinchStartHandler);
    if (pinchMoveHandler) previewEl.removeEventListener("touchmove", pinchMoveHandler);
  }
});
</script>

<style scoped>
@reference "@/assets/main.css";

/* Keep toolbar children at natural size in the nowrap scroll row on mobile */
.scriptorium-toolbar > * {
  flex-shrink: 0;
}

.enhance-error-enter-active,
.enhance-error-leave-active { transition: opacity 0.2s ease; }
.enhance-error-enter-from,
.enhance-error-leave-to { opacity: 0; }

/* ── Form controls (#243): bind directly to runtime theme vars ── */
/* Scoped styles are unlayered and win over Tailwind's @layer utilities,
   so this guarantees inputs pick up the JS-updated --card variable. */
input:not([type="checkbox"]):not([type="radio"]),
select {
  background-color: var(--card);
  color: var(--foreground);
}

/* ── Editor (dark app theme) ──────────────────────────────────── */
.phb-editor :deep(.ProseMirror) {
  @apply font-fell text-foreground outline-none;
  min-height: 100%;
  line-height: 1.75;
  font-size: 0.9375rem;
}
.phb-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  @apply text-muted-foreground;
  float: left;
  pointer-events: none;
  height: 0;
}
.phb-editor :deep(.ProseMirror h1) {
  @apply font-cinzel text-2xl font-bold mt-4 mb-2;
}
.phb-editor :deep(.ProseMirror h2) {
  @apply font-cinzel text-xl font-bold mt-3 mb-1.5;
}
.phb-editor :deep(.ProseMirror h3) {
  @apply font-cinzel text-base font-semibold mt-2 mb-1;
}
.phb-editor :deep(.ProseMirror ul),
.phb-editor :deep(.ProseMirror ol) {
  @apply pl-6 my-2;
}
/* #246: plain paragraphs must not inherit italic from callout containers */
.phb-editor :deep(.ProseMirror p) {
  font-style: normal;
}
.phb-editor :deep(.ProseMirror .sc-descriptive p),
.phb-editor :deep(.ProseMirror blockquote p),
.phb-editor :deep(.ProseMirror .sc-quote p) {
  font-style: italic;
}

.phb-editor :deep(.ProseMirror blockquote) {
  @apply border-l-4 border-primary pl-3 text-muted-foreground italic my-2;
}
.phb-editor :deep(.ProseMirror hr) {
  @apply border-border my-4;
}
.phb-editor :deep(.ProseMirror code) {
  @apply bg-muted px-1 rounded text-sm font-mono;
}
.phb-editor :deep(.ProseMirror pre) {
  @apply bg-muted p-3 rounded my-2 text-sm;
}
.phb-editor :deep(.ProseMirror img) {
  max-width: 380px;
  max-height: 480px;
  border-radius: 6px;
  object-fit: cover;
}

/* ── PHB Preview (themed output) ──────────────────────────────── */
/*
 * Palette + typography contract used by every .phb-* block below.
 * The two themes override this contract; every new scriptorium block
 * type added in future parity tickets MUST consume these vars rather
 * than hex literals so both themes stay in sync.
 *
 * Defaults = OneDnD 2024 (teal). Classic overrides are in
 * `.phb-body.theme-phb2014` below.
 *
 * TODO: swap the web-safe serif fallback for licensed Bookinsanity /
 * Mr Eaves faces once licensing is sorted.
 */
.phb-body.theme-onednd2024,
.phb-body.theme-phb2014,
.phb-page.theme-onednd2024,
.phb-page.theme-phb2014 {
  /* Typography */
  --sc-heading-font: "Cinzel", Georgia, serif;
  --sc-body-font: Georgia, "Times New Roman", serif;

  /* Palette */
  --sc-ink: #1a1a1a;
  --sc-accent: #7d1c1c; /* dark crimson — matches 2024 Monster Manual / D&D Beyond */
  --sc-accent-contrast: #f9f6ef;
  --sc-page-bg: #f9f6ef;
  --sc-callout-bg: #f5ece8; /* very light warm rose, derived from red accent */
  --sc-callout-border: var(--sc-accent);
  --sc-code-bg: #e4ddd0;
  --sc-col-rule: #c9b99a;

  /* Per-block treatments (themes override these to swap filled-bar H1
     for ruled H1 without rewriting every selector below) */
  --sc-h1-bg: var(--sc-accent);
  --sc-h1-color: var(--sc-accent-contrast);
  --sc-h1-border-b: none;
  --sc-h1-padding: 0.35rem 1rem;
  --sc-title-bar-bg: var(--sc-accent);
  --sc-title-bar-color: var(--sc-accent-contrast);
}

.phb-body.theme-phb2014,
.phb-page.theme-phb2014 {
  --sc-body-font: Georgia, "Palatino Linotype", "Book Antiqua", serif;
  --sc-accent: #58180d; /* deep red-brown, classic PHB ink */
  --sc-accent-contrast: #eeeadf;
  --sc-page-bg: #eeeadf;
  --sc-callout-bg: #e0e5c1; /* light olive/cream */

  /* Classic H1: no filled bar — red title on parchment with double rule below */
  --sc-h1-bg: transparent;
  --sc-h1-color: var(--sc-accent);
  --sc-h1-border-b: 3px double var(--sc-accent);
  --sc-h1-padding: 0.35rem 0 0.25rem;
}

/* Parchment-gray canvas between pages */
.phb-bg {
  background: #a09a90;
  padding: 1.5rem 1rem 3rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start; /* pages self-centre via margin: 0 auto; flex-start lets them overflow right when zoomed in */
  gap: 1.5rem;
  overscroll-behavior: contain; /* prevent swipe-to-back/forward navigation over the pannable area */
}

.phb-two-col {
  column-count: 2;
  column-gap: 1.5rem;
  column-rule: 1px solid var(--sc-col-rule);
}
.phb-two-col :deep(h1),
.phb-two-col :deep(h2) {
  column-span: all;
}
/* Headings inside callout/stat blocks must NOT span columns */
.phb-two-col :deep(.sc-note h1),
.phb-two-col :deep(.sc-note h2),
.phb-two-col :deep(.sc-descriptive h1),
.phb-two-col :deep(.sc-descriptive h2),
.phb-two-col :deep(.sc-wide h1),
.phb-two-col :deep(.sc-wide h2) {
  column-span: none;
}

/* Ink-friendly: strip background fills and decorative imagery in preview */
.phb-page.ink-friendly {
  --sc-callout-bg: transparent;
  --sc-page-bg: #fff;
  background: #fff;
}
.phb-page.ink-friendly :deep(.sc-watercolor),
.phb-page.ink-friendly :deep(.sc-watermark),
.phb-page.ink-friendly :deep(img.sc-decor) {
  display: none;
}
.phb-page.ink-friendly :deep(*) {
  background-image: none !important;
}

.phb-page {
  /* width / height / transform injected via :style (pageInnerStyle) — see script */
  position: relative;
  /* margin and flex-shrink live on the pageWrapperStyle wrapper — not here */
  background: url("/assets/scriptorium/page-background.webp") center / cover
    no-repeat;
  /* Padding matches PDF RENDER_CSS exactly — critical for WYSIWYG accuracy */
  padding: 60px 68px 53px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
  font-family: var(--sc-body-font);
  color: var(--sc-ink);
  line-height: 1.65;
  font-size: 15px;
  overflow: hidden;
}

.phb-title-bar {
  font-family: var(--sc-heading-font);
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--sc-title-bar-color);
  background: var(--sc-title-bar-bg);
  padding: 0.6rem 2.5rem;
  margin: -2.5rem -2.5rem 1.75rem;
  letter-spacing: 0.04em;
  line-height: 1.25;
}

.phb-hint {
  font-family: "Cinzel", Georgia, serif;
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  letter-spacing: 0.06em;
  padding: 0.5rem 0;
}

.phb-body :deep(h1) {
  font-family: var(--sc-heading-font);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--sc-h1-color);
  background: var(--sc-h1-bg);
  border-bottom: var(--sc-h1-border-b);
  padding: var(--sc-h1-padding);
  margin: 1.5rem -1rem 1rem;
  letter-spacing: 0.03em;
}
.phb-body :deep(h2) {
  font-family: var(--sc-heading-font);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--sc-accent);
  border-bottom: 2px solid var(--sc-accent);
  padding-bottom: 0.2rem;
  margin: 1.25rem 0 0.6rem;
  letter-spacing: 0.02em;
}
.phb-body :deep(h3) {
  font-family: var(--sc-heading-font);
  font-size: 0.9375rem;
  font-weight: 600;
  font-style: italic;
  color: var(--sc-accent);
  margin: 1rem 0 0.35rem;
}
.phb-body :deep(p) {
  margin: 0 0 0.6rem;
  font-style: normal; /* #246: resist italic inheritance from callout containers */
}
.phb-body :deep(ul),
.phb-body :deep(ol) {
  padding-left: 1.25rem;
  margin: 0.375rem 0 0.6rem;
}
.phb-body :deep(li) {
  margin: 0.2rem 0;
}
.phb-body :deep(blockquote) {
  border-left: 4px solid var(--sc-callout-border);
  background: var(--sc-callout-bg);
  padding: 0.6rem 0.875rem;
  margin: 0.875rem 0;
  border-radius: 0 4px 4px 0;
  font-style: italic;
}
.phb-body :deep(blockquote p) {
  margin: 0;
  font-style: italic; /* restore italic overridden by the general p rule */
}
.phb-body :deep(strong) {
  font-weight: 700;
}
.phb-body :deep(em) {
  font-style: italic;
}
/* <hr> = page break separator — hidden in preview, pages split on it */
.phb-body :deep(hr) {
  display: none;
}
.phb-body :deep(code) {
  background: var(--sc-code-bg);
  padding: 0.1em 0.35em;
  border-radius: 2px;
  font-family: "Courier New", monospace;
  font-size: 0.875em;
}
.phb-body :deep(pre) {
  background: var(--sc-accent);
  color: var(--sc-accent-contrast);
  padding: 0.875rem;
  border-radius: 4px;
  overflow-x: auto;
  margin: 0.875rem 0;
  font-size: 0.875em;
}
.phb-body :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}

/* ── Spacers ──────────────────────────────────────────────────── */

/* Editor: vertical spacer — dashed outline so authors can see it */
.phb-editor :deep(.ProseMirror .sc-spacer-v) {
  display: block;
  border: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
  border-radius: 2px;
  position: relative;
  min-height: 4px;
}
.phb-editor :deep(.ProseMirror .sc-spacer-v::after) {
  content: "spacer";
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: system-ui, sans-serif;
  font-size: 10px;
  color: color-mix(in srgb, currentColor 45%, transparent);
  pointer-events: none;
  letter-spacing: 0.04em;
}

/* Editor: horizontal spacer — inline dashed sliver */
.phb-editor :deep(.ProseMirror .sc-spacer-h) {
  border-bottom: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
  vertical-align: bottom;
  min-width: 4px;
  height: 1em;
}

/* Preview: spacers are invisible — just the empty space they occupy */
.phb-body :deep(.sc-spacer-v) {
  display: block;
  border: none;
}
.phb-body :deep(.sc-spacer-v::after) {
  display: none;
}
.phb-body :deep(.sc-spacer-h) {
  display: inline-block;
  border: none;
}

/* ── Column break ────────────────────────────────────────────── */

/* Preview: forces a CSS column break — invisible, zero height */
.phb-body :deep(.sc-column-break) {
  break-before: column;
  display: block;
  height: 0;
}

/* Editor: faint dashed rule so authors can see where the break is */
.phb-editor :deep(.ProseMirror .sc-column-break) {
  display: block;
  height: 0;
  border-top: 1px dashed
    color-mix(in srgb, var(--sc-col-rule, currentColor) 60%, transparent);
  margin: 0.5rem 0;
  position: relative;
}
.phb-editor :deep(.ProseMirror .sc-column-break::after) {
  content: "column break";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: system-ui, sans-serif;
  font-size: 9px;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, currentColor 40%, transparent);
  background: var(--background, #fff);
  padding: 0 0.4rem;
  pointer-events: none;
}

/* ── Decoration overlay CSS variables ─────────────────────────── */
/*
 * --sc-decoration-watermark  — diagonal watermark text colour (falls back to --sc-accent)
 * --sc-decoration-credit     — artist credit text colour (falls back to --sc-ink)
 *
 * Both themes receive the same defaults here; override in the .theme-phb2014
 * block above if a theme-specific tint is ever needed.
 */
.phb-body.theme-onednd2024,
.phb-body.theme-phb2014,
.phb-page.theme-onednd2024,
.phb-page.theme-phb2014 {
  --sc-decoration-watermark: var(--sc-accent);
  --sc-decoration-credit: var(--sc-ink);
}

/* ── Watercolor: editor placeholder ───────────────────────────── */
/*
 * In the ProseMirror editor the <img data-type="watercolor"> is rendered
 * as a block atom. Add a dashed outline so authors can see / select it,
 * and apply mix-blend-mode so the editor preview matches PHB output.
 */
.phb-editor :deep(.ProseMirror img[data-type="watercolor"]) {
  outline: 1px dashed color-mix(in srgb, currentColor 40%, transparent);
  outline-offset: 2px;
  border-radius: 2px;
  mix-blend-mode: multiply;
}

/* ── Watermark: editor placeholder ───────────────────────────── */
/*
 * The watermark wrapper is `position:absolute` in the rendered output, which
 * collapses to nothing in the flat ProseMirror flow. Render it as a labelled
 * inline block so authors can see and select it.
 */
.phb-editor :deep(.ProseMirror div[data-type="watermark"]) {
  position: static !important;
  display: block;
  border: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
  border-radius: 2px;
  padding: 0.25rem 0.75rem;
  margin: 0.5rem 0;
  overflow: hidden;
  max-height: 3rem;
}
.phb-editor :deep(.ProseMirror div[data-type="watermark"] span) {
  position: static !important;
  font-size: 1.25rem;
  transform: none !important;
  opacity: 0.45;
}

/* ── Artist credit: editor placeholder ───────────────────────── */
.phb-editor :deep(.ProseMirror div[data-type="artistCredit"]) {
  position: static !important;
  display: block;
  border: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
  border-radius: 2px;
  padding: 0.15rem 0.5rem;
  margin: 0.25rem 0;
  font-size: 0.7rem;
  font-style: italic;
  opacity: 0.65;
}

/* ── Decoration in PHB preview ───────────────────────────────── */
/*
 * .phb-page is position:relative — absolutely-positioned children from
 * the renderHTML inline styles will anchor there correctly.
 * No further overrides needed: all positioning is driven by inline styles
 * emitted by each node's renderHTML method.
 */
.phb-body :deep(img[data-type="watercolor"]) {
  mix-blend-mode: multiply;
}

/* ── Wide block ──────────────────────────────────────────────── */

/*
 * Preview: column-span:all escapes the CSS multi-column flow so the
 * container spans the full page width. In single-column documents the
 * property is a no-op — identical rendering to a normal block.
 */
.phb-body :deep(.sc-wide) {
  column-span: all;
  margin: 0.75rem 0;
}

/*
 * Editor: dashed outline so authors can see the wide block boundary.
 * The "wide" label appears at the top-left corner.
 */
.phb-editor :deep(.ProseMirror .sc-wide) {
  outline: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
  outline-offset: 3px;
  border-radius: 2px;
  padding: 0.25rem;
  margin: 0.5rem 0;
  position: relative;
}
.phb-editor :deep(.ProseMirror .sc-wide::before) {
  content: "wide";
  position: absolute;
  top: -0.75rem;
  left: 0.25rem;
  font-family: system-ui, sans-serif;
  font-size: 9px;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, currentColor 45%, transparent);
  pointer-events: none;
}

/* ── Cover page ──────────────────────────────────────────────── */
/*
 * A cover page node is an atom that fills its own physical page.  In the
 * PHB preview each .phb-page is an independent div, so the cover simply
 * occupies the page that holds it.  In the editor the atom is rendered
 * inline as a selectable block with a labelled dashed outline so authors
 * can see and click it.
 *
 * The cover node's renderHTML uses only inline styles + CSS variables from
 * the palette contract, so both themes render correctly without any
 * selector overrides here.  The rules below handle only the editor
 * preview representation.
 */

/* Editor: show as a tall labeled block so the variant is identifiable */
.phb-editor :deep(.ProseMirror div[data-type="coverPage"]) {
  position: relative;
  display: block;
  border: 2px dashed color-mix(in srgb, currentColor 30%, transparent);
  border-radius: 4px;
  min-height: 8rem;
  margin: 0.75rem 0;
  overflow: hidden;
  cursor: default;
}
.phb-editor :deep(.ProseMirror div[data-type="coverPage"]::before) {
  content: "cover: " attr(data-variant);
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: system-ui, sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: color-mix(in srgb, currentColor 45%, transparent);
  pointer-events: none;
  white-space: nowrap;
}
/* Suppress the absolutely-positioned children inside the editor atom so
   they don't overflow the dashed box or collide with sibling content. */
.phb-editor :deep(.ProseMirror div[data-type="coverPage"] > *) {
  display: none;
}

/* Preview: cover fills its .phb-page parent which is already
   position:relative.  The node's renderHTML places its children with
   position:absolute / inset:0 relative to that ancestor.  We just
   make the cover wrapper itself position:absolute and full-bleed so
   the absolutely-positioned children anchor correctly. */
.phb-body :deep(div[data-type="coverPage"]) {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

/* Back cover and front cover variants suppress the running page-number
   footer. The pageFooters computed already returns null for these pages,
   so .sc-footer is not rendered — this rule is a belt-and-suspenders guard
   in case CSS :has() ever needs to do it independently. */
.phb-page:has(div[data-type="coverPage"][data-variant="back"]) .sc-footer,
.phb-page:has(div[data-type="coverPage"][data-variant="front"]) .sc-footer {
  display: none;
}

/* ── Page footer bar ──────────────────────────────────────────── */

.sc-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 68px; /* matches PDF RENDER_CSS */
  font-family: var(--sc-body-font);
  font-size: 12px; /* matches PDF RENDER_CSS */
  color: var(--sc-accent);
  box-sizing: border-box;
}

.sc-footer-text {
  font-style: italic;
  font-variant: small-caps;
}

.sc-footer-num {
  font-weight: 600;
}

/* Recto (right-hand, odd page number): # on right, no left # */
.sc-footer--recto .sc-footer-num--left { display: none; }
/* Verso (left-hand, even page number): # on left, no right # */
.sc-footer--verso .sc-footer-num--right { display: none; }

/* ── Skip / Reset counting chips (editor only) ────────────────── */

/*
 * In the ProseMirror editor these atom nodes render as small labelled chips
 * so authors can see and select them. In the preview they are hidden via
 * sc-skip-counting / sc-reset-counting display:none below.
 */
.phb-editor :deep(.ProseMirror .sc-skip-counting),
.phb-editor :deep(.ProseMirror .sc-reset-counting) {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.5rem;
  border: 1px dashed color-mix(in srgb, currentColor 40%, transparent);
  border-radius: 3px;
  font-family: system-ui, sans-serif;
  font-size: 10px;
  letter-spacing: 0.05em;
  color: color-mix(in srgb, currentColor 55%, transparent);
  background: color-mix(in srgb, currentColor 5%, transparent);
  cursor: default;
  user-select: none;
  margin: 0.25rem 0;
}
.phb-editor :deep(.ProseMirror .sc-skip-counting::before) {
  content: "skip #";
}
.phb-editor :deep(.ProseMirror .sc-reset-counting::before) {
  content: "reset \2116";
}

/* Preview: marker atoms are invisible — zero height, no display */
.phb-body :deep(.sc-skip-counting),
.phb-body :deep(.sc-reset-counting) {
  display: none;
}

/* ── Table of Contents ───────────────────────────────────────── */

/*
 * Editor: atom placeholder — dashed outline with descriptive label.
 */
.phb-editor :deep(.ProseMirror nav[data-type="toc"]) {
  display: block;
  border: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
  border-radius: 4px;
  padding: 0.75rem 1rem;
  margin: 0.75rem 0;
  font-family: system-ui, sans-serif;
  font-size: 0.75rem;
  text-align: center;
  letter-spacing: 0.05em;
  color: color-mix(in srgb, currentColor 45%, transparent);
}
.phb-editor :deep(.ProseMirror nav[data-type="toc"]::after) {
  content: "Table of Contents (auto-generated on preview)";
}

/*
 * Preview: rendered TOC — two-column list with dotted leaders.
 * All colours consumed from the palette contract (--sc-* vars)
 * so both themes render correctly.
 */
.phb-body :deep(.sc-toc) {
  font-family: var(--sc-body-font);
  color: var(--sc-ink);
  margin: 0.75rem 0 1rem;
}
.phb-body :deep(.sc-toc-heading) {
  font-family: var(--sc-heading-font);
  font-size: 1rem;
  font-weight: 700;
  color: var(--sc-accent);
  border-bottom: 2px solid var(--sc-accent);
  padding-bottom: 0.2rem;
  margin: 0 0 0.75rem;
  letter-spacing: 0.03em;
}
.phb-body :deep(.sc-toc-list) {
  list-style: none;
  padding: 0;
  margin: 0;
  column-count: 2;
  column-gap: 1.5rem;
}
.phb-body :deep(.sc-toc-item) {
  break-inside: avoid;
  margin: 0.2rem 0;
}
.phb-body :deep(.sc-toc-h2) {
  padding-left: 1rem;
  font-size: 0.875em;
}
.phb-body :deep(.sc-toc-h3) {
  padding-left: 2rem;
  font-size: 0.8125em;
  font-style: italic;
}
.phb-body :deep(.sc-toc-link) {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  text-decoration: none;
  color: var(--sc-ink);
}
.phb-body :deep(.sc-toc-link:hover) {
  color: var(--sc-accent);
}
.phb-body :deep(.sc-toc-text) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
  flex-shrink: 1;
  min-width: 0;
}
.phb-body :deep(.sc-toc-leader) {
  flex: 1 1 auto;
  border-bottom: 1px dotted color-mix(in srgb, var(--sc-ink) 40%, transparent);
  align-self: flex-end;
  margin-bottom: 0.2em;
  min-width: 0.75rem;
}
.phb-body :deep(.sc-toc-page) {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--sc-accent);
  min-width: 1.5rem;
  text-align: right;
}
.phb-body :deep(.sc-toc-empty) {
  color: color-mix(in srgb, var(--sc-ink) 50%, transparent);
  font-style: italic;
  font-size: 0.875em;
}

/* ── Class progression table (.sc-class-table) ───────────────── */
/*
 * Applied to the Tiptap table node in all four class table templates.
 * Palette driven by CSS variables — both themes render correctly.
 */
.phb-body :deep(.sc-class-table),
.phb-editor :deep(.ProseMirror .sc-class-table) {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--sc-body-font, Georgia, serif);
  font-size: 0.6875rem; /* #241: reduced from 0.8125rem to fit 14-col table */
  color: var(--sc-ink, #1a1a1a);
  line-height: 1.3;
  margin: 0.75rem 0;
}
.phb-body :deep(.sc-class-table th),
.phb-editor :deep(.ProseMirror .sc-class-table th) {
  font-family: var(--sc-heading-font, "Cinzel", Georgia, serif);
  font-size: 0.75rem;
  font-variant: small-caps;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  color: var(--sc-accent-contrast, #f9f6ef);
  background: var(--sc-accent, #1b3a4b);
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--sc-accent, #1b3a4b);
  white-space: normal; /* #241: allow header text to wrap */
  min-width: 0;
}
.phb-body :deep(.sc-class-table td),
.phb-editor :deep(.ProseMirror .sc-class-table td) {
  text-align: center;
  padding: 0.2rem 0.4rem;
  border: 1px solid
    color-mix(in srgb, var(--sc-accent, #1b3a4b) 30%, transparent);
  vertical-align: middle;
}
.phb-body :deep(.sc-class-table td p),
.phb-editor :deep(.ProseMirror .sc-class-table td p),
.phb-body :deep(.sc-class-table th p),
.phb-editor :deep(.ProseMirror .sc-class-table th p) {
  margin: 0;
}
.phb-body :deep(.sc-class-table tr:nth-child(odd) td),
.phb-editor :deep(.ProseMirror .sc-class-table tr:nth-child(odd) td) {
  background: color-mix(in srgb, var(--sc-accent, #1b3a4b) 8%, transparent);
}
.phb-body :deep(.sc-class-table td:first-child),
.phb-editor :deep(.ProseMirror .sc-class-table td:first-child) {
  font-weight: 700;
}

/* ── Callout block CSS variables ─────────────────────────────── */
/*
 * Type-specific colour knobs for note / descriptive / quote blocks.
 * Defaults = OneDnD 2024 (teal family); classic overrides in .theme-phb2014.
 *
 * --sc-callout-note-bg       background fill of .sc-note
 * --sc-callout-note-border   accent border colour for .sc-note
 * --sc-callout-desc-bg       background fill of .sc-descriptive
 * --sc-callout-desc-border   accent border colour for .sc-descriptive
 * --sc-callout-quote-color   italic body text colour for .sc-quote
 * --sc-callout-attr-color    attribution line text colour
 */
.phb-body.theme-onednd2024,
.phb-body.theme-phb2014,
.phb-page.theme-onednd2024,
.phb-page.theme-phb2014 {
  --sc-callout-note-bg: var(--sc-callout-bg);
  --sc-callout-note-border: var(--sc-callout-border);
  --sc-callout-desc-bg: color-mix(
    in srgb,
    var(--sc-accent) 12%,
    var(--sc-page-bg)
  );
  --sc-callout-desc-border: var(--sc-accent);
  --sc-callout-quote-color: var(--sc-ink);
  --sc-callout-attr-color: color-mix(
    in srgb,
    var(--sc-accent) 80%,
    var(--sc-ink)
  );
}

/* Classic theme callout overrides */
.phb-body.theme-phb2014,
.phb-page.theme-phb2014 {
  --sc-callout-note-bg: #e0e5c1;
  --sc-callout-note-border: var(--sc-accent);
  --sc-callout-desc-bg: #ddd8c4;
  --sc-callout-desc-border: var(--sc-accent);
  --sc-callout-attr-color: var(--sc-accent);
}

/* ── Note block ───────────────────────────────────────────────── */

/* Preview */
.phb-body :deep(.sc-note) {
  background: var(--sc-callout-note-bg);
  border-left: 3px solid var(--sc-callout-note-border);
  border-radius: 0 4px 4px 0;
  padding: 0.6rem 0.875rem;
  margin: 0.875rem 0;
}
.phb-body :deep(.sc-note p) {
  margin: 0 0 0.4rem;
  font-size: 0.875em;
  font-style: italic;
}
.phb-body :deep(.sc-note p:last-child) {
  margin-bottom: 0;
}

/* Classic: double rule top + bottom, no left border */
.phb-body.theme-phb2014 :deep(.sc-note) {
  border-left: none;
  border-top: 2px double var(--sc-callout-note-border);
  border-bottom: 2px double var(--sc-callout-note-border);
  border-radius: 0;
  padding: 0.5rem 0.875rem;
}

/* Editor */
.phb-editor :deep(.ProseMirror .sc-note) {
  border-left: 3px solid
    color-mix(in srgb, var(--primary, currentColor) 60%, transparent);
  background: color-mix(in srgb, var(--primary, currentColor) 8%, transparent);
  border-radius: 0 4px 4px 0;
  padding: 0.5rem 0.75rem;
  margin: 0.5rem 0;
}
.phb-editor :deep(.ProseMirror .sc-note p) {
  font-style: italic;
}

/* ── Descriptive block ────────────────────────────────────────── */

/* Preview */
.phb-body :deep(.sc-descriptive) {
  background: var(--sc-callout-desc-bg);
  border: 2px solid var(--sc-callout-desc-border);
  border-radius: 4px;
  padding: 0.875rem 1rem;
  margin: 0.875rem 0;
  font-style: italic;
}
.phb-body :deep(.sc-descriptive p) {
  margin: 0 0 0.5rem;
  font-style: italic; /* restore italic overridden by the general p rule */
}
.phb-body :deep(.sc-descriptive p:last-child) {
  margin-bottom: 0;
}

/* Classic: heavier border, square corners */
.phb-body.theme-phb2014 :deep(.sc-descriptive) {
  border-radius: 0;
  border-width: 3px;
}

/* Editor */
.phb-editor :deep(.ProseMirror .sc-descriptive) {
  border: 2px solid
    color-mix(in srgb, var(--primary, currentColor) 50%, transparent);
  background: color-mix(in srgb, var(--primary, currentColor) 6%, transparent);
  border-radius: 4px;
  padding: 0.75rem;
  margin: 0.5rem 0;
  font-style: italic;
}

/* ── Quote block ──────────────────────────────────────────────── */

/* Preview */
.phb-body :deep(.sc-quote) {
  padding: 0.375rem 1rem;
  margin: 0.875rem 0;
  color: var(--sc-callout-quote-color);
  font-style: italic;
}
.phb-body :deep(.sc-quote p) {
  margin: 0 0 0.35rem;
  font-style: italic; /* restore italic overridden by the general p rule */
}
.phb-body :deep(.sc-quote p:last-child) {
  margin-bottom: 0;
}

/* Attribution — em-dash via pseudo so empty attribution renders cleanly */
.phb-body :deep(.sc-attribution) {
  font-style: normal;
  font-variant: small-caps;
  font-size: 0.875em;
  color: var(--sc-callout-attr-color);
  margin: 0.35rem 0 0;
  letter-spacing: 0.02em;
}
.phb-body :deep(.sc-attribution::before) {
  content: "\2014\00A0";
}

/* Editor */
.phb-editor :deep(.ProseMirror .sc-quote) {
  border-left: 2px solid color-mix(in srgb, currentColor 30%, transparent);
  padding: 0.25rem 0.75rem;
  margin: 0.5rem 0;
  font-style: italic;
  color: color-mix(in srgb, currentColor 75%, transparent);
}
.phb-editor :deep(.ProseMirror .sc-attribution) {
  font-style: normal;
  font-variant: small-caps;
  font-size: 0.875em;
  opacity: 0.75;
}
.phb-editor :deep(.ProseMirror .sc-attribution::before) {
  content: "\2014\00A0";
}

/* ── Ability score table ────────────────────────────────────────── */
/* Two-row borderless table: header row (STR/DEX/…) + value row */
.phb-body :deep(.sc-ability-table) {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin: 6px 0 8px;
  font-family: var(--sc-body-font);
  font-size: 0.875em;
}
.phb-body :deep(.sc-ability-table th) {
  font-family: var(--sc-heading-font);
  font-size: 0.875em;
  font-variant: small-caps;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-align: center;
  color: var(--sc-accent);
  padding: 1px 2px 3px;
  border: none;
  background: transparent;
}
.phb-body :deep(.sc-ability-table td) {
  text-align: center;
  padding: 1px 2px;
  border: none;
  color: var(--sc-ink);
}
/* Classic 2014: a thin rule under the header row mirrors PHB layout */
.phb-body.theme-phb2014 :deep(.sc-ability-table th) {
  border-bottom: 1px solid var(--sc-accent);
}
/* Editor placeholder styling */
.phb-editor :deep(.ProseMirror .sc-ability-table th) {
  background: color-mix(in srgb, var(--sc-accent) 8%, transparent);
}

/* ── 2024 ability table variant ──────────────────────────────────────────── */
/*
 * Nine-column layout: 4 cols (name + Score + Mod + Save) · 1 gap col ·
 * 4 cols (name + Score + Mod + Save) — mirrors the D&D Beyond 2024 layout.
 *
 * .sc-abil-name  — ability name cell (STR/DEX/… label + accent background)
 * .sc-abil-gap   — invisible spacer column between the two panels
 */
.phb-body :deep(.sc-ability-table--2024) {
  table-layout: auto;
}
/* Full header row (all non-gap th) gets accent fill — matches D&D Beyond layout */
.phb-body :deep(.sc-ability-table--2024 thead th:not(.sc-abil-gap)) {
  background: var(--sc-accent);
  color: var(--sc-accent-contrast);
  font-family: var(--sc-heading-font);
  font-size: 0.6875rem;
  font-variant: small-caps;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-align: center;
  padding: 4px 6px;
  border: none;
  white-space: nowrap;
}
/* Body ability-name cells (td.sc-abil-name) also get accent fill */
.phb-body :deep(.sc-ability-table--2024 tbody td.sc-abil-name) {
  background: var(--sc-accent);
  color: var(--sc-accent-contrast);
  font-family: var(--sc-heading-font);
  font-size: 0.75rem;
  font-weight: 700;
  font-variant: small-caps;
  letter-spacing: 0.05em;
  text-align: center;
  padding: 3px 8px;
  border: none;
  white-space: nowrap;
}
/* Data cells (body score/mod/save columns) */
.phb-body :deep(.sc-ability-table--2024 tbody td:not(.sc-abil-gap):not(.sc-abil-name)) {
  font-size: 0.875rem;
  text-align: center;
  padding: 2px 4px;
  color: var(--sc-ink);
  border-bottom: 1px solid color-mix(in srgb, var(--sc-accent) 15%, transparent);
}
/* Gap column — invisible separator between the two panels */
.phb-body :deep(.sc-ability-table--2024 .sc-abil-gap) {
  width: 1rem;
  border: none !important;
  background: transparent !important;
  padding: 0;
}

/* Editor: same color treatment in the ProseMirror view */
.phb-editor :deep(.ProseMirror .sc-ability-table--2024 td.sc-abil-name),
.phb-editor :deep(.ProseMirror .sc-ability-table--2024 thead th:not(.sc-abil-gap)) {
  background: color-mix(in srgb, currentColor 30%, transparent);
  font-weight: 700;
  font-variant: small-caps;
}
.phb-editor :deep(.ProseMirror .sc-ability-table--2024 .sc-abil-gap) {
  width: 1rem;
  border: none;
  background: transparent;
}

/* ── Image layout modes ─────────────────────────────────────────── */
/* Wrap-left: float image left, text flows around the right edge */
.phb-body :deep(.sc-img-wrap--wrapLeft) {
  float: left;
  shape-outside: margin-box;
  margin: 0 1em 1em 0;
  clear: left;
}
/* Wrap-right: float image right, text flows around the left edge */
.phb-body :deep(.sc-img-wrap--wrapRight) {
  float: right;
  shape-outside: margin-box;
  margin: 0 0 1em 1em;
  clear: right;
}
/* Bleed variants extend image into the column gutter */
.phb-body :deep(.sc-img-wrap--wrapLeft.sc-img-wrap--gutter) {
  margin-left: -3em;
}
.phb-body :deep(.sc-img-wrap--wrapRight.sc-img-wrap--gutter) {
  margin-right: -3em;
}
/* Absolute: positioned relative to .phb-page (already position:relative) */
.phb-body :deep(.sc-img-wrap--absolute) {
  position: absolute;
  z-index: 10;
}
/* Editor: show a subtle outline on absolute images so they're discoverable */
.phb-editor :deep(.ProseMirror .sc-img-wrap--absolute) {
  outline: 2px dashed oklch(0.7 0.15 250 / 0.6);
  outline-offset: 2px;
}

/* Selection ring — shown on any selected atom node (image, spacer, etc).
   ProseMirror adds .ProseMirror-selectednode to the top-level wrapper of
   the selected atom node, so this covers .sc-img-wrap divs and bare <img>. */
.phb-editor :deep(.ProseMirror .ProseMirror-selectednode),
.phb-editor :deep(.ProseMirror img.ProseMirror-selectednode) {
  outline: 2px solid oklch(0.6 0.2 250);
  outline-offset: 2px;
}

/* #244: Spacer nodes are zero-height; use background fill so the ring is visible. */
.phb-editor :deep(.ProseMirror [data-type="spacer-v"].ProseMirror-selectednode),
.phb-editor :deep(.ProseMirror [data-type="spacer-h"].ProseMirror-selectednode) {
  outline: 2px solid oklch(0.6 0.2 250);
  outline-offset: 0px;
  background: oklch(0.6 0.2 250 / 0.2);
}
</style>
