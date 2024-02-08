import crypto from 'node:crypto'
import dayjs from 'dayjs'; 
import { env } from 'hono/adapter'
import type { Database } from './supabase.types.ts'
import type { Details, JwtUser } from './types.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Context } from 'hono'

export function jwtDecoder(jwt: string): JwtUser {
  return JSON.parse(atob(jwt.split('.')[1]))
}

export const fetchLimit = 50

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

// Regex for Zod validation of an app id
export const reverseDomainRegex = /^[a-z0-9]+(\.[a-z0-9_-]+)+$/i

// Regex for Zod validation of a device id. Examples:
//    44f128a5-ac7a-4c9a-be4c-224b6bf81b20 (android)
//    0F673663-459A-44C0-A7F5-613F2A4AF3AB (ios)
export const deviceIdRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

// Zod validation messages
export const MISSING_STRING_APP_ID = 'App ID is required'
export const NON_STRING_APP_ID = 'App ID must be a string'
export const INVALID_STRING_APP_ID = 'App ID must be a reverse domain string'

export const MISSING_STRING_DEVICE_ID = 'Device ID is required'
export const NON_STRING_DEVICE_ID = 'Device ID must be a string'
export const INVALID_STRING_DEVICE_ID = 'Device ID must be a valid UUID string'

export const MISSING_STRING_VERSION_NAME = 'Version name is required'
export const NON_STRING_VERSION_NAME = 'Version name must be a string'

export const MISSING_STRING_VERSION_BUILD = 'Version build is required'
export const NON_STRING_VERSION_BUILD = 'Version build must be a string'

export const MISSING_STRING_VERSION_OS = 'Version OS is required'
export const NON_STRING_VERSION_OS = 'Version OS must be a string'

export const MISSING_STRING_PLATFORM = 'Platform is required'
export const NON_STRING_PLATFORM = 'Platform must be a string'

export function shallowCleanObject(obj: Record<string, unknown>) {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    if (value ?? false)
      acc[key] = value

    return acc
  }, {} as Record<string, unknown>)
}

export async function checkKey(authorization: string | undefined, supabase: SupabaseClient<Database>, allowed: Database['public']['Enums']['key_mode'][]): Promise<Database['public']['Tables']['apikeys']['Row'] | null> {
  if (!authorization)
    return null
  try {
    const { data, error } = await supabase
      .from('apikeys')
      .select()
      .eq('key', authorization)
      .in('mode', allowed)
      .single()
    if (!data || error)
      return null
    return data
  }
  catch (error) {
    console.log(error)
    return null
  }
}

export function sendResBg(data: any = { status: 'ok' }, statusCode = 200) {
  if (statusCode >= 400)
    console.error('sendResBg error', JSON.stringify(data, null, 2))
}

export function sendRes(data: any = { status: 'ok' }, statusCode = 200) {
  if (statusCode >= 400)
    console.error('sendRes error', JSON.stringify(data, null, 2))

  return sendResText(JSON.stringify(data), statusCode)
}

export function appendHeaders(res: Response, key: string, value: string) {
  res.headers.append(key, value)
}

export function sendResText(data: string, statusCode = 200) {
  if (statusCode >= 400)
    console.error('sendRes error', JSON.stringify(data, null, 2))

  return new Response(
    data,
    {
      status: statusCode,
      headers: { ...basicHeaders, ...corsHeaders },
    },
  )
}

export function sendOptionsRes() {
  return new Response(
    'ok',
    {
      headers: {
        ...corsHeaders,
      },
    },
  )
}

interface LimitedApp {
  id: string
  ignore: number
}

export function isLimited(c: Context, id: string) {
  const limits = getEnv(c, 'LIMITED_APPS')
  if (!limits)
    return false
  const apps = JSON.parse(limits) as LimitedApp[]
  const app = apps.find(a => a.id === id)
  if (!app || app.ignore === 0)
    return false
  if (app.ignore === 1)
    return true
  // check is Math.random() < ignore
  return Math.random() < app.ignore
}

export function getEnv(c: Context, key: string): string {
  const val = env<any>(c)[key]
  return val || ''
}

export function makeHMACContent(payload: string, details: Details) {
  return `${details.timestamp}.${payload}`
}

export function createHmac(c: Context, data: string, details: Details) {
  const hmac = crypto.createHmac('sha256', getEnv(c, 'STRIPE_WEBHOOK_SECRET'))
  hmac.write(makeHMACContent(data, details))
  hmac.end()
  return hmac.read().toString('hex')
}

export function formatDateCH(date: string | undefined) {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss.000')
}

export function convertAllDatesToCH(obj: any) {
  // look in all objects for dates fields ( created_at or updated_at ) and convert them if need
  const datesFields = ['created_at', 'updated_at']
  const newObj = { ...obj }
  datesFields.forEach((field) => {
    if (newObj[field])
      newObj[field] = formatDateCH(newObj[field])
  })
  return newObj
}
