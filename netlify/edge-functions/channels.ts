import { handle } from 'https://deno.land/x/hono@v4.0.0/adapter/netlify/mod.ts'
import { app } from '../../supabase/functions/_backend/public/channels.ts'
// TODO: remove when old url removed
export default handle(app as any)
