import { S3Client } from 'https://deno.land/x/s3_lite_client@0.3.0/mod.ts'

const accountid = Deno.env.get('R2_ACCOUNT_ID')
const access_key_id = Deno.env.get('R2_ACCESS_KEY_ID')
const access_key_secret = Deno.env.get('R2_SECRET_ACCESS_KEY')

// https://9ee3d7479a3c359681e3fab2c8cb22c0.r2.cloudflarestorage.com/capgo

export const upload = (file: Blob) => {
  const id = crypto.randomUUID()
  const s3client = new S3Client({
    endPoint: `https://${accountid}.r2.cloudflarestorage.com`,
    region: 'us-east-1',
    bucket: 'capgo',
    accessKey: access_key_id,
    secretKey: access_key_secret,
  })

  // Upload a file:
  s3client.getObject(id)
  return s3client.putObject(id, file.stream())
}

export const checkIfExist = (fileId: string) => {
  const s3client = new S3Client({
    endPoint: `https://${accountid}.r2.cloudflarestorage.com`,
    region: 'us-east-1',
    bucket: 'capgo',
    accessKey: access_key_id,
    secretKey: access_key_secret,
  })

  // Upload a file:
  return s3client.exists(fileId)
}

export const getSignedUrl = (fileId: string) => {
  const s3client = new S3Client({
    endPoint: `https://${accountid}.r2.cloudflarestorage.com`,
    region: 'us-east-1',
    bucket: 'capgo',
    accessKey: access_key_id,
    secretKey: access_key_secret,
  })
  return s3client.getPresignedUrl('GET', fileId, {
    expirySeconds: 120,
  })
}
