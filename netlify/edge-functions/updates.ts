import { handle } from 'https://deno.land/x/hono@v4.0.0-rc.3/adapter/netlify/mod.ts'
import { app } from '../../supabase/functions/_backend/private/plugins/updates.ts'

export default handle(app as any)