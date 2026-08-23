<template>
  <div>
    <div class="overflow-x-auto">
      <table :class="cn('w-full', DENSITY[density].text)">
        <thead>
          <tr class="border-b border-border bg-muted/20">
            <th
              v-for="col in table.columns"
              :key="col"
              :class="
                cn(
                  'text-left text-label-lg font-semibold text-muted-foreground whitespace-nowrap',
                  DENSITY[density].head,
                )
              "
            >
              {{ col }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, i) in table.rows"
            :key="i"
            class="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
          >
            <td
              v-for="(cell, j) in row"
              :key="j"
              :class="
                cn(
                  'font-fell text-foreground align-top',
                  DENSITY[density].cell,
                  j === 0 && 'font-semibold whitespace-nowrap',
                )
              "
            >
              {{ cell }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p
      v-if="table.note"
      :class="
        cn(
          'text-caption text-muted-foreground italic border-t border-border/50',
          DENSITY[density].note,
        )
      "
    >
      {{ table.note }}
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * One DM-screen reference table — header row, body, and the footnote some
 * tables carry.
 *
 * Extracted when the dashboard's quick card (#764) needed to render exactly
 * what `/rules` → Screen already rendered. Two copies of a table whose first
 * column is bold-and-nowrap while the rest wrap would have drifted on the
 * first styling touch, and the DM screen is precisely the surface where the
 * page and the widget must look like the same reference.
 *
 * Deliberately no card chrome and no title: `ScreenTab` wraps it in a bordered
 * panel with an `h3`, and the widget hands the title to `DashboardWidget`'s own
 * header. What is shared is the table; what surrounds it is not.
 */
import { cn } from "@/lib/utils";
import type { ScreenTable } from "@/data/dmScreen";

const { table, density = "comfortable" } = defineProps<{
  table: ScreenTable;
  /**
   * `compact` for the dashboard card, which is a third of a grid row rather
   * than a full-width tab — the comfortable padding costs it about two visible
   * rows, which on a quick-reference card is most of the point of having it.
   */
  density?: keyof typeof DENSITY;
}>();

const DENSITY = {
  comfortable: {
    text: "text-sm",
    head: "px-4 py-2",
    cell: "px-4 py-2.5",
    note: "px-4 py-2.5",
  },
  compact: {
    text: "text-caption",
    head: "px-3 py-1.5",
    cell: "px-3 py-1.5",
    note: "px-3 py-2",
  },
} as const;
</script>
