-- Migration: group_portrait_ai_provenance
-- #607 follow-through: campaigns.group_portrait_url is written by BOTH the AI
-- generator (useGroupPortrait.generateGroupPortrait) and manual upload
-- (useGroupPortrait.uploadGroupPortrait), so player views have no way to know
-- whether the current portrait is AI-generated. Same shape/nullability
-- semantics as the 13 entity ai_provenance columns added in
-- 20260804000002_ai_provenance_columns.sql: null = no known AI involvement.

alter table campaigns add column if not exists group_portrait_ai_provenance jsonb;

comment on column campaigns.group_portrait_ai_provenance is
  '{ generatorType, provider, model, generatedAt, edited } when group_portrait_url came from an AI generator. Null = not AI / unknown. A manual upload (useGroupPortrait.uploadGroupPortrait) replaces the portrait and clears this to null -- clearing is honest because the image itself was replaced, not unlabelling. See #606/#607, context/compliance/provenance-architecture.md.';
