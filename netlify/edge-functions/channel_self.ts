import { handle } from 'https://deno.land/x/hono@v4.0.0/adapter/netlify/mod.ts'
import { app } from '../../supabase/functions/_backend/plugins/channel_self.ts'

export default handle(app as any)
