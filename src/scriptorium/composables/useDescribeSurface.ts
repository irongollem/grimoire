/**
 * The picture a book's panel is describing, as the Familiar's "Paint picture" card sees it (#1270 story 7).
 *
 * "Describe it" on a selected picture opens the card; what the card paints must land on that picture, which only the
 * panel knows (the picture it was clicked on, the book's page shape and how a queued job is marked on the chapter). The
 * panel registers itself while it is mounted, the way the note editor does (`provideNoteSurface`).
 */
import { computed, onScopeDispose, shallowRef } from "vue";
import type { DescribeShape } from "@/scriptorium/lib/describeShapes";

export interface DescribeSurface {
  /** The book's campaign: only a book of the active campaign may be painted for, since the card works in that one. */
  campaignId(): string | null;
  /** The shapes the book's page offers. */
  shapes(): DescribeShape[];
  /** Whether a picture was chosen to be described (the click that opened the card). */
  hasTarget(): boolean;
  /** A render has been queued for the chosen picture. */
  start(job: { jobId: string; shape: string }): void;
}

const surface = shallowRef<DescribeSurface | null>(null);

/** The panel that is open on a book, or null. */
export const currentDescribeSurface = computed(() => surface.value);

export function provideDescribeSurface(next: DescribeSurface): void {
  surface.value = next;
  onScopeDispose(() => {
    if (surface.value === next) surface.value = null;
  });
}
