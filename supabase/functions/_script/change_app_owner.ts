/// <reference lib="deno.ns" />
import { S3Client } from 'https://deno.land/x/s3_lite_client@0.7.0/mod.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js'
import { ensureFile } from 'https://deno.land/std/fs/ensure_file.ts'
import type { Database } from '../_backend/utils/supabase.types.ts'

const supabaseUrl = 'https://xvwzpoazmxkqosrdewyv.supabase.co'
const supabaseServiceRole = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2d3pwb2F6bXhrcW9zcmRld3l2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTY5NzgwNTc4OCwiZXhwIjoyMDEzMzgxNzg4fQ.yI0f2IvaPl1ktMoaHeSzctMF491XT8Aa6D1W0OTilYY'
const appToTransfer = 'com.starlingminds.dev.member'
const newOwnerEmail = 'admin@starlingminds.com'

async function main() {
  const s3client = new S3Client({
    endPoint: '9ee3d7479a3c359681e3fab2c8cb22c0.r2.cloudflarestorage.com',
    port: 9000,
    useSSL: true,
    region: 'us-west-1',
    accessKey: '4b774468d838171f31fadb4e2d149450',
    secretKey: 'b46010ff7cf283b2a2912505bfc738d5d322d073ce82a6afd6f662dee11eaf50',
    bucket: 'capgo',
  })

  const supabase = createClient<Database>(supabaseUrl, supabaseServiceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  const { data: oldUser, error: error1 } = await supabase.from('apps')
    .select('*')
    .eq('app_id', appToTransfer)
    .single()

  if (error1)
    throw error1

  const { data: newUser, error: error2 } = await supabase.from('users')
    .select('*')
    .eq('email', newOwnerEmail)
    .single()

  if (error2)
    throw error1

  const oldUserId = (oldUser as any).user_id as string
  const newUserId = (newUser as any).id as string

  console.log(`old id: ${JSON.stringify(oldUserId)}`)
  console.log(`new id: ${JSON.stringify(newUserId)}`)

  console.log(`tmp dir: /tmp/move-tmp`)
  try {
    await Deno.mkdir('/tmp/move-tmp')
  }
  catch (err) {
    if (!(err instanceof Deno.errors.AlreadyExists))
      throw err
  }

  console.log(`Listing objects for ${oldUserId}`)
  for await (const obj of s3client.listObjects({ prefix: `apps/${oldUserId}/` })) {
    console.log(`Processing ${obj.key}`)
    const getObj = await s3client.getObject(obj.key)
    await ensureFile(`/tmp/move-tmp/${obj.key}`)
    const file = await Deno.create(`/tmp/move-tmp/${obj.key}`)
    await getObj.body?.pipeTo(file.writable)

    await s3client.copyObject({ sourceKey: obj.key }, obj.key.replace(oldUserId, newUserId))
    await s3client.deleteObject(obj.key)
  }

  console.log('Updating user_id in apps')
  const { error: error3 } = await supabase.from('apps')
    .update({ user_id: newUserId })
    .eq('user_id', oldUserId)

  if (error3)
    throw error3

  console.log('Updating user_id in app_versions')
  const { error: error4 } = await supabase.from('app_versions')
    .update({ user_id: newUserId })
    .eq('app_id', appToTransfer)

  if (error4)
    throw error4

  console.log('Updating user_id in app_versions_meta')
  const { error: error5 } = await supabase.from('app_versions_meta')
    .update({ user_id: newUserId })
    .eq('app_id', appToTransfer)

  if (error5)
    throw error5

  console.log('Updating user_id in channel_devices')
  const { error: error6 } = await supabase.from('channel_devices')
    .update({ created_by: newUserId })
    .eq('app_id', appToTransfer)

  if (error6)
    throw error6

  console.log('Updating user_id in channels')
  const { error: error7 } = await supabase.from('channels')
    .update({ created_by: newUserId })
    .eq('app_id', appToTransfer)

  if (error7)
    console.log(JSON.stringify(error7))

  console.log('Updating user_id in devices_override')
  const { error: error8 } = await supabase.from('devices_override')
    .update({ created_by: newUserId })
    .eq('app_id', appToTransfer)

  if (error8)
    console.log(JSON.stringify(error8))
}

await main()
