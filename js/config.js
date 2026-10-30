/**
 * FitCircle — global config.
 * ONE FLAG switches the whole app between the local mock backend and Supabase.
 *   ADAPTER: 'mock'      -> localStorage + seed data (default, works offline)
 *   ADAPTER: 'supabase'  -> real backend (fill the two SUPABASE_* values)
 *
 * The AI provider key NEVER lives here: the coach calls a Supabase Edge Function
 * (COACH_FUNCTION) which holds the key server-side.
 */
export const CONFIG = {
  ADAPTER: 'mock', // 'mock' | 'supabase'

  SUPABASE_URL: '',      // e.g. https://xxxx.supabase.co
  SUPABASE_ANON_KEY: '', // public anon key (safe in frontend, protected by RLS)
  COACH_FUNCTION: 'coach', // Edge Function name

  // ⚠️ MOCK-ONLY demo admin credentials. Never used when ADAPTER === 'supabase'.
  MOCK_ADMIN: { email: 'admin@fitcircle.app', password: 'admin123' },

  APP_VERSION: '1.0.0',
  DB_KEY: 'fc:db:v1',        // localStorage key of the mock database
  SEED_VERSION: 1,
};
