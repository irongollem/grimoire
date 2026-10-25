import { computed, type Ref } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";

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
  /**
   * Whether the reporter's text is still stored, which it is only until GitHub
   * has the issue (and never on rows older than the column). The text itself
   * is fetched per report, like the screenshot.
   */
  has_report_text: boolean;
  /**
   * The filing's state, from the admin-only `bug_report_filings` (null for a
   * filed report, and for anyone but the admin): kept off `bug_reports` so the
   * reporter's own read and export never carry our GitHub token's troubles.
   */
  bug_report_filings: BugReportFiling | null;
  created_at: string;
}

export interface BugReportFiling {
  /** Set while a filing is in flight; older than ten minutes means it died. */
  claimed_at: string | null;
  /** Why the last filing failed, in our words. */
  error: string | null;
  /** GitHub may already hold this issue; filing again needs "file anyway". */
  uncertain: boolean;
}

/** What the reporter typed, as `bug_reports.report_text` stores it. */
export interface BugReportText {
  where?: string;
  action?: string;
  expected?: string;
  actual?: string;
  summary?: string;
  problem?: string;
}

/** Columns minus `screenshot` and `report_text`, which are fetched one row at a time. */
const LIST_COLUMNS =
  "id, user_id, kind, issue_number, has_screenshot, screenshot_purged_at, has_report_text, created_at, bug_report_filings(claimed_at, error, uncertain)";

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
      // The filing embed is one-to-one (its key is the report's id), so
      // PostgREST answers with an object or null; supabase-js, without
      // generated types for this table, can only guess an array.
      return data as unknown as AdminBugReport[];
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

/** One report's stored text, fetched only once a maintainer opens it. */
export function useAdminBugReportText(reportId: Ref<string | null>) {
  return useQuery({
    queryKey: ["admin", "bug-report-text", reportId],
    queryFn: async (): Promise<BugReportText | null> => {
      const { data, error } = await supabase
        .from("bug_reports")
        .select("report_text")
        .eq("id", reportId.value!)
        .single();
      if (error) throw error;
      return data.report_text as BugReportText | null;
    },
    enabled: computed(() => !!reportId.value),
  });
}

/**
 * File a stored report that GitHub refused the first time. The token lives
 * server-side, so this goes through create-bug-report rather than to GitHub;
 * the function checks the caller is the admin, claims the report so two
 * clicks cannot file it twice, and records the outcome either way, so the
 * list is refetched whether it worked or not. `force` is for a report GitHub
 * may already hold, which the function otherwise refuses.
 */
export function useRefileBugReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, force }: { id: string; force: boolean }): Promise<number> => {
      const { data, error } = await supabase.functions.invoke("create-bug-report", {
        body: { refile: id, force },
      });
      if (error) throw new Error(await edgeErrorMessage(error));
      return (data as { issueNumber: number }).issueNumber;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin", "bug-reports"] }),
  });
}
