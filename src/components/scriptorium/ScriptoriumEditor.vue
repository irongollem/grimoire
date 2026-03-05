<template>
  <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
    <!-- Editor pane -->
    <div class="rounded-lg border border-border bg-card p-4">
      <p class="font-cinzel text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
        Editor
      </p>
      <p class="font-fell text-muted-foreground italic text-sm">
        Tiptap rich text editor — coming soon.
      </p>
    </div>

    <!-- Preview pane -->
    <div class="rounded-lg border border-border overflow-hidden">
      <div class="px-4 py-2 border-b border-border bg-card">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Preview — OneDnD Style
        </p>
      </div>
      <div class="scriptorium-page min-h-64 p-4">
        <h2>Document Preview</h2>
        <p>
          Your formatted document will appear here, styled to match the 2024 Player's Handbook.
        </p>
      </div>
    </div>
  </div>
</template>
