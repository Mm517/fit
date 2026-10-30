// Supabase Edge Function `coach` — the ONLY place the AI key exists (set with:
//   supabase secrets set AI_API_KEY=...  ). Deploy: supabase functions deploy coach
// Contract with the frontend (js/ai/coach.js):
//   request : { message: string, history: [{role, text}] }
//   response: { text: string, tool_calls?: [{ name, args }], suggestions?: string[] }
// The frontend executes tool_calls through js/ai/tools.js, so confirmations, undo and the
// admin "tools enabled / confirmation rules" keep working with a real LLM.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TOOLS = [
  { name: 'create_plan', description: 'Create a weekly plan from a template', input_schema: { type: 'object', properties: { days_count: { type: 'integer' }, goal: { type: 'string' } } } },
  { name: 'set_alarm', description: 'Set a wake-up alarm', input_schema: { type: 'object', properties: { time: { type: 'string', description: 'HH:MM 24h' }, days: { type: 'array', items: { type: 'integer' } }, label: { type: 'string' } }, required: ['time'] } },
  // add edit_plan, log_workout, swap_exercise, create_post with the same shapes as js/ai/tools.js
];

Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization') ?? '';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response('unauthorized', { status: 401 });

  const { message, history = [] } = await req.json();
  const { data: cfg } = await sb.from('app_settings').select('value').eq('id', 'coach').maybeSingle(); // admin-only row: use a service-role client here
  const system = cfg?.value?.system_prompt ?? 'أنت مدرب لياقة يتحدث العربية.';

  // TODO: call your LLM provider here with { system, messages: [...history, message], tools: TOOLS }
  // using Deno.env.get('AI_API_KEY'), then map its tool calls to { name, args }.
  const reply = { text: 'هذه نسخة تجريبية من الـ Edge Function. اربطها بمزوّد الذكاء الاصطناعي.', tool_calls: [], suggestions: [] };
  return new Response(JSON.stringify(reply), { headers: { 'Content-Type': 'application/json' } });
});
