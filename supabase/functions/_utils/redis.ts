import type { Redis } from 'https://deno.land/x/redis@v0.24.0/mod.ts'
import { connect } from 'https://deno.land/x/redis@v0.24.0/mod.ts'

let REDIS: Redis

export function parseRedisUrl(url: string): { hostname: string; password: string | undefined; port: string; name: string | undefined } {
  url = url.replace('redis://', '')
  const splitted = url.split(':')
  if (splitted.length !== 3)
    throw new Error('Cannot parse redis url')

  const splittedPassword = splitted[1].split('@')
  if (splittedPassword.length !== 2)
    throw new Error('Cannot parse redis url (password)')

  const parsed = {
    hostname: splittedPassword[1],
    password: splittedPassword[0] === 'default' ? undefined : splittedPassword[0],
    port: splitted[2],
    name: splitted[0] === 'default' ? undefined : splitted[0],
  }

  return parsed
}

export async function getRedis() {
  const redisEnv = Deno.env.get('REDIS_URL')
  if (!redisEnv)
    return undefined

  if (!REDIS)
    REDIS = await connect(parseRedisUrl(redisEnv))

  return REDIS
}

export async function redisAppVersionInvalidate(app_id: string) {
  const redis = await getRedis()
  if (!redis)
    return

  const hashCacheKey = `app_${app_id}`
  let cursor = 0
  const pipeline = redis.pipeline()
  let hscan: [string, string[]]

  async function callHscan(redis: Redis) {
    hscan = await redis.hscan(hashCacheKey, cursor, { pattern: 'ver*', count: 5000 })
    cursor = parseInt(hscan[0])

    // Really?
    for (let i = 0; i < hscan[1].length; i++) {
      if (i % 2 === 1)
        continue

      await pipeline.hdel(hashCacheKey, hscan[1][i])
    }
  }

  await callHscan(redis)

  while (cursor !== 0)
    await callHscan(redis)

  await pipeline.flush()
}

export async function redisDeviceInvalidate(appId: string, deviceId: string) {
  const redis = await getRedis()
  if (!redis)
    return
  await redis.hdel(`app_${appId}`, `device_${deviceId}`)
}
