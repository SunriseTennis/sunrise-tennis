-- Migration: Add gender column to players table (idempotent)
-- Supports gendered competitions and program filtering

ALTER TABLE players ADD COLUMN IF NOT EXISTS gender text;
