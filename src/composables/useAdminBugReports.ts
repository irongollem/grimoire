import { computed, type Ref } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

/**
 * One in-app bug report, as the admin panel sees it.
 *
 * The reporter used to be printed into the public GitHub issue; since #633 the
 * issue carries no identity at all and this row is the only link back to a
 * person. `has_screenshot` is a generated column so the list can show which
 * reports have an image without fetching any of them.
 */
export interface AdminBugReport {
  id: string;
  user_id: string;
  kind: "bug" | "feature";
  issue_number: number | null;
  has_screenshot: boolean;
  /** Set when the 90-day retention job cleared the image (#634). */
  screenshot_purged_at: string | null;
  created_at: string;
}

/** Columns minus `screenshot` — the base64 image is fetched one row at a time. */
const LIST_COLUMNS =
  "id, user_id, kind, issue_number, has_screenshot, screenshot_purged_at, created_at";

/**
 * Admin-only listing of in-app bug reports (#633, #634).
 *
 * Reads `bug_reports` directly rather than through an RPC: the table's SELECT
 * policy already resolves to `private.is_app_admin()` for admins and own-rows
 * for everyone else, so a `SECURITY DEFINER` wrapper would add an RPC to the
 * public surface to re-implement a check RLS is doing correctly.
 */
export function useAdminBugReports() {
  const query = useQuery({
    queryKey: ["admin", "bug-reports"],
    queryFn: async (): Promise<AdminBugReport[]> => {
      const { data, error } = await supabase
        .from("bug_reports")
        .select(LIST_COLUMNS)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminBugReport[];
    },
    staleTime: 30_000,
  });

  return query;
}

/**
 * The base64 screenshot for one report, fetched only once a maintainer opens it.
 *
 * Kept out of the list query on purpose: these are up to 5MB each, and pulling
 * every one of them over the wire to decide whether to draw a thumbnail is the
 * cost `has_screenshot` exists to avoid. Resolves to `null` once retention has
 * purged the image.
 */
export function useAdminBugReportScreenshot(reportId: Ref<string | null>) {
  return useQuery({
    queryKey: ["admin", "bug-report-screenshot", reportId],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("bug_reports")
        .select("screenshot")
        .eq("id", reportId.value!)
        .single();
      if (error) throw error;
      return data?.screenshot ?? null;
    },
    enabled: computed(() => !!reportId.value),
    staleTime: Infinity,
  });
}
