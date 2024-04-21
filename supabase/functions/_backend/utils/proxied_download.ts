import type { Context } from 'hono'
import { getEnv } from './utils.ts'

const EXPIRATION_SECONDS = 120
const ALGORITHM = { name: 'HMAC', hash: 'SHA-256' }

// This code is stolen fron https://deno.land/x/hono@v4.2.5/utils/encode.ts?source=#L20
// atob does not support utf-8 characters. So we need a little bit hack.
export function decodeBase64(str: string): Uint8Array {
  const binary = atob(str)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  const half = binary.length / 2
  for (let i = 0, j = binary.length - 1; i <= half; i++, j--) {
    bytes[i] = binary.charCodeAt(i)
    bytes[j] = binary.charCodeAt(j)
  }
  return bytes
}

async function getKey(c: Context) {
  const keyString = getEnv(c, 'PROXIED_DOWNLOAD_HMAC_PRIVATE_KEY')
  const keyBuffer = decodeBase64(keyString)

  const key = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    ALGORITHM,
    false,
    ['sign', 'verify'],
  )
  return key
}

export async function generateSecureProxiedDownloadUrl(c: Context, path: string, appId: string, bundleId: number) {
  const toSign = {
    expiry: EXPIRATION_SECONDS,
    path,
    appId,
    bundleId,
  }

  const key = await getKey(c)
  const enc = new TextEncoder()

  const signature = await crypto.subtle.sign(ALGORITHM.name, key, enc.encode(JSON.stringify(toSign)))
  const digest = btoa(String.fromCharCode(...new Uint8Array(signature)))

  const finalObject = {
    digest,
    ...toSign,
  }

  const finalUrl = new URL(getEnv(c, 'PROXIED_DOWNLOAD_URL'))
  finalUrl.searchParams.append('details', btoa(JSON.stringify(finalObject)))
  return finalUrl.toJSON()
}

export async function verifyProxiedDownloadSignatire(c: Context, signature: string, fullObject: any) {
  const signatureArray = decodeBase64(signature)
  const key = await getKey(c)

  const fullObjCopy = structuredClone(fullObject)
  delete fullObjCopy.digest

  return crypto.subtle.verify(ALGORITHM.name, key, signatureArray, new TextEncoder().encode(JSON.stringify(fullObjCopy)))
}
