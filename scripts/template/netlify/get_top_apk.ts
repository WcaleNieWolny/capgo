import type { BaseHeaders } from 'supabase/functions/_utils/types'
import type { Handler } from '@netlify/functions'
import type { IAppItem, IAppItemFullDetail } from 'google-play-scraper'
import gplay from 'google-play-scraper'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '~/types/supabase.types'

export const methodJson = ['POST', 'PUT', 'PATCH']
export const basicHeaders = {
  'Access-Control-Expose-Headers': 'Content-Length, X-JSON',
  'Content-Type': 'application/json',
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
export const sendRes = (data: any = { status: 'ok' }, statusCode = 200) => {
  if (statusCode >= 400)
    console.error('sendRes error', JSON.stringify(data, null, 2))

  return new Response(
    JSON.stringify(data),
    {
      status: statusCode,
      headers: { ...basicHeaders, ...corsHeaders },
    },
  )
}

export const supabaseClient = () => {
  const options = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
  return createClient<Database>(process.env.SUPABASE_URL || '', process.env.SUPABASE_ANON_KEY || '', options)
}

const getList = async (category = gplay.category.APPLICATION, collection = gplay.collection.TOP_FREE, limit = 1000) => {
  const res = await gplay.list({
    category,
    collection,
    num: limit,
  })
  const upgraded = res.map((item, i) => {
    return gplay.app({ appId: item.appId }).then(res => ({
      url: item.url,
      appId: item.appId,
      title: item.title,
      summary: item.summary,
      developer: item.developer,
      icon: item.icon,
      score: item.score,
      free: item.free,
      category,
      collection,
      rank: i + 1,
      developerEmail: res.developerEmail,
      installs: res.maxInstalls,
    } as Database['public']['Tables']['store_apps']['Insert']))
  })
  return Promise.all(upgraded)
}

const main = async (url: URL, headers: BaseHeaders, method: string, body: any) => {
  console.log('main', url, headers, method, body)
  const list = await getList(body.category, body.collection, body.limit)
  // save in supabase
  const { error } = await supabaseClient()
    .from('store_apps')
    .upsert(list)
  if (error)
    console.log('error', error)
  return sendRes(list)
}
// upper is ignored during netlify generation phase
// import from here
export const handler: Handler = async (event) => {
  try {
    const url: URL = new URL(event.rawUrl)
    console.log('queryStringParameters', event.queryStringParameters)
    const headers: BaseHeaders = { ...event.headers }
    const method: string = event.httpMethod
    const body: any = methodJson.includes(method) ? JSON.parse(event.body || '{}') : event.queryStringParameters
    const res = await main(url, headers, method, body)
    return res as any
  }
  catch (e) {
    return sendRes({ status: 'Error', error: JSON.stringify(e) }, 500)
  }
}
