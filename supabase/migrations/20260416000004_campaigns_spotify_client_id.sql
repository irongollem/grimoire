-- Migration: campaigns_spotify_client_id
-- Add spotify_client_id column to campaigns for per-campaign BYOK Spotify integration

alter table campaigns add column spotify_client_id text;
