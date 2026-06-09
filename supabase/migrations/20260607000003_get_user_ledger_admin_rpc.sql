-- Migration: get_user_ledger_admin_rpc
-- Admin-only per-user credit ledger lookup. Returns every ai_credit_ledger row
-- for one user (grants + generations) with a chronological running balance and
-- the estimated USD cost of generation rows (same cost chain as the
-- ai_generation_costs view). Gated on is_app_admin() so only app admins can read
-- another user's ledger — supports answering "where did my credits go" for any user.

create or replace function get_user_ledger(p_user_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  reason text,
  delta numeric,
  model text,
  provider text,
  is_byok boolean,
  image_count integer,
  input_tokens integer,
  input_image_tokens bigint,
  output_tokens integer,
  estimated_cost_usd_cents numeric,
  running_balance numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_app_admin() then
    raise exception 'Not authorized';
  end if;

  return query
    select
      l.id,
      l.created_at,
      l.reason,
      l.delta,
      l.model,
      l.provider,
      l.is_byok,
      l.image_count,
      l.input_tokens,
      l.input_image_tokens,
      l.output_tokens,
      case
        when p.image_output_cost_per_million_tokens is not null
             and (l.input_tokens is not null or l.input_image_tokens is not null or l.output_tokens is not null)
          then round(
            coalesce(l.input_tokens, 0)::numeric       / 1000000 * coalesce(p.input_cost_per_million_tokens, 0)       * 100
            + coalesce(l.input_image_tokens, 0)::numeric / 1000000 * coalesce(p.image_input_cost_per_million_tokens, 0) * 100
            + coalesce(l.output_tokens, 0)::numeric      / 1000000 * p.image_output_cost_per_million_tokens             * 100,
            4)
        when p.cost_per_image_usd is not null
          then round(coalesce(l.image_count, 1)::numeric * p.cost_per_image_usd * 100, 4)
        when p.input_cost_per_million_tokens is not null
          then round(
            coalesce(l.input_tokens, 0)::numeric  / 1000000 * p.input_cost_per_million_tokens          * 100
            + coalesce(l.output_tokens, 0)::numeric / 1000000 * coalesce(p.output_cost_per_million_tokens, 0) * 100,
            4)
        else null::numeric
      end as estimated_cost_usd_cents,
      sum(l.delta) over (order by l.created_at, l.id) as running_balance
    from ai_credit_ledger l
    left join ai_model_pricing p on l.model = p.model
    where l.user_id = p_user_id
    order by l.created_at desc, l.id desc;
end;
$$;

grant execute on function get_user_ledger(uuid) to authenticated;
