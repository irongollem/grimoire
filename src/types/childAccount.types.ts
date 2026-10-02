/** A row of `child_accounts` (#919, migration 20260928053257). */
export interface ChildAccountLink {
  child_user_id: string;
  parent_user_id: string;
  login_name: string;
  /** `YYYY-MM-DD`: the first day the account is its owner's own. */
  adult_on: string;
  consent_version: string;
  consented_at: string;
  created_at: string;
}
