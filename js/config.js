/**
 * FitCircle — global config.
 * ONE FLAG switches the whole app between the local mock backend and Supabase.
 *   ADAPTER: 'mock'      -> localStorage + seed data (works offline, for demos)
 *   ADAPTER: 'supabase'  -> real backend (project "krustyburger", every table prefixed fc_)
 *
 * Tip: open the app with ?mock in the URL to force the mock backend without editing this file.
 *
 * The AI provider keys (OpenRouter / Gemini) NEVER live here: the coach calls a Supabase Edge
 * Function (COACH_FUNCTION) which holds them as secrets. The anon/publishable key below is public
 * by design — Row Level Security protects the data.
 */
const forceMock = typeof location !== 'undefined' && new URLSearchParams(location.search).has('mock');

export const CONFIG = {
  ADAPTER: forceMock ? 'mock' : 'supabase', // 'mock' | 'supabase'

  SUPABASE_URL: 'https://cijujqhxdjpvuyzbxedf.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_gl8UtuGMo-TdBdJFGOyzog_aT1igxOz', // publishable key (safe in the frontend)
  COACH_FUNCTION: 'coach', // Edge Function name
  NUTRITION_FUNCTION: 'nutrition', // Edge Function: meal-photo analysis + nutrition chat
  MEDIA_BUCKET: 'fitcircle-media', // public Storage bucket (5MB, images only, per-user folders)
  TABLE_PREFIX: 'fc_', // the Supabase project is shared with the Krusty Burger app

  // ⚠️ MOCK-ONLY demo admin credentials. Never used when ADAPTER === 'supabase'.
  MOCK_ADMIN: { email: 'admin@fitcircle.app', password: 'admin123' },

  APP_VERSION: '1.2.0',
  DB_KEY: 'fc:db:v1',        // localStorage key of the mock database
  SEED_VERSION: 2,
};
