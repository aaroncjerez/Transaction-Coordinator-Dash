/**
 * Supabase Client for AI Dialer
 *
 * Initializes and caches a Supabase client using credentials from
 * the SQLite settings table (or .env fallback).
 * Pattern: follows fub-client.ts
 */

import type Database from 'better-sqlite3';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let cachedUrl: string | null = null;
let cachedKey: string | null = null;

function getSettingValue(db: Database.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
  return row?.value || null;
}

export function getSupabaseConfig(db: Database.Database): { url: string; anonKey: string } | null {
  const url = getSettingValue(db, 'supabase_url') || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Prefer service role key (bypasses RLS) for server-side operations
  const anonKey = getSettingValue(db, 'supabase_service_role_key')
    || getSettingValue(db, 'supabase_anon_key')
    || process.env.SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function getSupabaseClient(db: Database.Database): SupabaseClient {
  const config = getSupabaseConfig(db);
  if (!config) {
    throw new Error('Supabase not configured — set URL and Anon Key in Settings.');
  }

  // Re-create client if credentials changed
  if (cachedClient && cachedUrl === config.url && cachedKey === config.anonKey) {
    return cachedClient;
  }

  cachedClient = createClient(config.url, config.anonKey);
  cachedUrl = config.url;
  cachedKey = config.anonKey;
  return cachedClient;
}

export function isSupabaseConfigured(db: Database.Database): boolean {
  return getSupabaseConfig(db) !== null;
}
