import { Hono } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import type { Context } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import { middlewareKey } from '../../_utils/hono.ts'
import { supabaseAdmin } from '../../_utils/supabase.ts'

export const app = new Hono()

app.get('/', middlewareKey, async (c: Context) => {
  try {
    const { data: plans } = await supabaseAdmin(c)
      .from('plans')
      .select()
      .order('price_m')
    return c.json(plans || [])
  } catch (e) {
    return c.json({ status: 'Cannot get plans', error: JSON.stringify(e) }, 500) 
  }
})
