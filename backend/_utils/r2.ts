import { S3Client } from 'https://deno.land/x/s3_lite_client@0.6.1/mod.ts'
import type { Context } from 'https://deno.land/x/hono@v3.12.7/mod.ts'
import { getEnv } from './utils.ts'

// import presign s3

const bucket = 'capgo'

function initR2(c: Context) {
  const accountid = getEnv(c, 'R2_ACCOUNT_ID')
  const access_key_id = getEnv(c, 'R2_ACCESS_KEY_ID')
  const access_key_secret = getEnv(c, 'R2_SECRET_ACCESS_KEY')
  const storageEndpoint = getEnv(c, 'S3_ENDPOINT')
  const storageRegion = getEnv(c, 'S3_REGION')
  const storagePort = Number.parseInt(c, getEnv('S3_PORT'))
  const storageUseSsl = getEnv(c, 'S3_SSL').toLocaleLowerCase() === 'true'
  const params = {
    endPoint: accountid ? `${accountid}.r2.cloudflarestorage.com` : storageEndpoint,
    region: storageRegion ?? 'us-east-1',
    useSSL: accountid ? true : storageUseSsl,
    port: storagePort ? (!Number.isNaN(storagePort) ? storagePort : undefined) : undefined,
    bucket,
    accessKey: access_key_id,
    secretKey: access_key_secret,
  }

  return new S3Client(params)
}

function upload(c: Context, fileId: string, file: Uint8Array) {
  const client = initR2(c)
  return client.putObject(fileId, file)
}

function getUploadUrl(c: Context, fileId: string, expirySeconds = 60) {
  const client = initR2(c)
  return client.getPresignedUrl('PUT', fileId, { expirySeconds })
}

function deleteObject(c: Context, fileId: string) {
  const client = initR2(c)
  return client.deleteObject(fileId)
}

function checkIfExist(c: Context, fileId: string) {
  const client = initR2(c)
  return client.exists(fileId)
}

function getSignedUrl(c: Context, fileId: string, expirySeconds: number) {
  const client = initR2(c)
  return client.getPresignedUrl('GET', fileId, { expirySeconds })
}
// get the size from r2
async function getSizeChecksum(c: Context, fileId: string) {
  const client = initR2(c)
  const { size, metadata } = await client.statObject(fileId)
  const checksum = metadata['x-amz-meta-crc32']
  return { size, checksum }
}

export const r2 = {
  upload,
  getSizeChecksum,
  deleteObject,
  checkIfExist,
  getSignedUrl,
  getUploadUrl,
}
