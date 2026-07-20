begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

select has_column('public', 'custom_classes', 'source_record_key', 'classes retain provider record identity');
select has_column('public', 'custom_subclasses', 'ruleset', 'subclasses carry edition metadata');
select has_column('public', 'backgrounds', 'source_document_key', 'backgrounds retain provider document identity');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000545', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'identity-tests@example.invalid', '', '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

select lives_ok($$
  insert into public.custom_classes (
    user_id, class_name, source, ruleset, conceptual_key, source_document_key, source_record_key
  ) values
    ('00000000-0000-4000-8000-000000000545', 'Sorcerer', 'SRD 5.1', '2014', 'sorcerer', 'srd-2014', 'srd_sorcerer'),
    ('00000000-0000-4000-8000-000000000545', 'Sorcerer', 'SRD 5.2', '2024', 'sorcerer', 'srd-2024', 'srd-2024_sorcerer')
$$, 'same-name class editions coexist');

select is(
  (select count(*)::integer from public.custom_classes
   where user_id = '00000000-0000-4000-8000-000000000545' and conceptual_key = 'sorcerer'),
  2,
  'conceptual identity groups without collapsing versions'
);

select throws_ok($$
  insert into public.custom_classes (
    user_id, class_name, source, ruleset, conceptual_key, source_document_key, source_record_key
  ) values (
    '00000000-0000-4000-8000-000000000545', 'Renamed Sorcerer', 'SRD 5.2', '2024',
    'sorcerer', 'srd-2024', 'srd-2024_sorcerer'
  )
$$, '23505', null, 'repeat imports cannot duplicate a provider record');

select throws_ok($$
  insert into public.backgrounds (user_id, name, ruleset)
  values ('00000000-0000-4000-8000-000000000545', 'Impossible Edition', '2025')
$$, '23514', null, 'unsupported background editions are rejected');

select * from finish();
rollback;
