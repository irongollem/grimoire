-- The original operator route accepted a free-form reason while promising its
-- seven-year audit row could never contain the removed address. An operator
-- could naturally enter that address in the reason and recreate the data the
-- withdrawal had just deleted. Keep only the non-identifying event category.

drop function public.admin_remove_waitlist_email(text, text);

create function public.admin_remove_waitlist_email(p_email text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_deleted integer;
begin
  if not private.is_app_admin() then
    raise exception 'Not authorized';
  end if;

  if v_email = '' then
    raise exception 'admin_remove_waitlist_email: an address is required';
  end if;

  delete from public.pro_waitlist where lower(email) = v_email;
  get diagnostics v_deleted = row_count;

  insert into public.admin_audit_log (admin_user_id, action, target_user_id, details)
  values (
    auth.uid(),
    'waitlist_removal',
    null,
    jsonb_build_object('rows_removed', v_deleted, 'reason', 'requested_by_email')
  );

  return v_deleted;
end;
$$;

comment on function public.admin_remove_waitlist_email(text) is
  'Removes a pro_waitlist address on direct request. Admin-gated; audit-logged with a count and fixed non-identifying reason.';

revoke execute on function public.admin_remove_waitlist_email(text) from public, anon;
grant execute on function public.admin_remove_waitlist_email(text) to authenticated, service_role;
