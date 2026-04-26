-- Migration: add_stripe_annual_price_id_to_plans
-- Add stripe_annual_price_id column to plans so both price IDs live in the DB

alter table plans add column stripe_annual_price_id text;
