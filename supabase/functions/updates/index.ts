import { serve } from 'https://deno.land/std@0.167.0/http/server.ts'
import { cryptoRandomString } from 'https://deno.land/x/crypto_random_string@1.1.0/mod.ts'
import * as semver from 'https://deno.land/x/semver@v1.4.1/mod.ts'
import { sendRes } from '../_utils/utils.ts'
import { isAllowedAction, sendStats, supabaseAdmin, updateOrCreateDevice } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { invalidIp } from '../_utils/invalids_ip.ts'
import { checkPlan } from '../_utils/plans.ts'

interface Channel {
  version: definitions['app_versions']
}
interface ChannelDev {
  channel_id: definitions['channels'] & Channel
}
interface AppInfos {
  version_name: string
  version_build: string
  version_os: string
  custom_id?: string
  is_prod?: boolean
  is_emulator?: boolean
  plugin_version: string
  platform: string
  app_id: string
  device_id: string
}

serve(async (event: Request) => {
  // create random id
  const id = cryptoRandomString({ length: 10 })
  try {
    const body = (await event.json()) as AppInfos
    console.log(id, 'body', body)
    let {
      version_name,
      version_build,
    } = body
    const {
      platform,
      app_id,
      device_id,
      version_os,
      plugin_version = '2.3.3',
      custom_id,
      is_emulator = false,
      is_prod = true,
    } = body
    // if version_build is not semver, then make it semver
    const coerce = semver.coerce(version_build)
    if (coerce) {
      version_build = coerce.version
    }
    else {
      return sendRes({
        message: `Native version: ${version_build} doesn't follow semver convention, please follow https://semver.org to allow Capgo compare version number`,
        error: 'semver_error',
      }, 400)
    }
    version_name = (version_name === 'builtin' || !version_name) ? version_build : version_name
    if (!app_id || !device_id || !version_build || !version_name || !platform) {
      console.log('Cannot get all vars', platform,
        app_id,
        device_id,
        custom_id,
        version_build,
        is_emulator,
        is_prod,
        version_name)
      return sendRes({
        message: 'Cannot find device_id or appi_id',
        error: 'missing_info',
      }, 400)
    }

    console.log(id, 'Headers', platform,
      app_id,
      device_id,
      custom_id,
      version_build,
      is_emulator,
      is_prod,
      plugin_version,
      version_name)

    const { data: channelData, error: dbError } = await supabaseAdmin()
      .from<definitions['channels'] & Channel>('channels')
      .select(`
          id,
          created_at,
          created_by,
          name,
          app_id,
          allow_dev,
          allow_emulator,
          disableAutoUpdateUnderNative,
          disableAutoUpdateToMajor,
          ios,
          android,
          version (
            id,
            name,
            checksum,
            session_key,
            user_id,
            bucket_id,
            external_url
          )
        `)
      .eq('app_id', app_id)
      .eq('public', true)
      .single()
    const { data: channelOverride } = await supabaseAdmin()
      .from<definitions['channel_devices'] & ChannelDev>('channel_devices')
      .select(`
          device_id,
          app_id,
          channel_id (
            id,
            created_at,
            created_by,
            name,
            app_id,
            allow_dev,
            allow_emulator,
            disableAutoUpdateUnderNative,
            disableAutoUpdateToMajor,
            ios,
            android,
            version (
              id,
              name,
              checksum,
              session_key,
              user_id,
              bucket_id,
              external_url
            )
          ),
          created_at,
          updated_at
        `)
      .eq('device_id', device_id)
      .eq('app_id', app_id)
      .single()
    const { data: devicesOverride } = await supabaseAdmin()
      .from<definitions['devices_override'] & Channel>('devices_override')
      .select(`
          device_id,
          app_id,
          created_at,
          updated_at,
          version (
            id,
            name,
            checksum,
            session_key,
            user_id,
            bucket_id,
            external_url
          )
        `)
      .eq('device_id', device_id)
      .eq('app_id', app_id)
      .single()
    if (dbError || !channelData) {
      console.log(id, 'Cannot get channel', app_id, `no default channel ${JSON.stringify(dbError)}`)
      return sendRes({
        message: 'Cannot get channel',
        err: `no default channel ${JSON.stringify(dbError)}`,
      }, 200)
    }
    let channel = channelData
    const planValid = await isAllowedAction(channel.created_by)
    await checkPlan(channel.created_by)
    let version: definitions['app_versions'] = channel.version
    const xForwardedFor = event.headers.get('x-forwarded-for') || ''
    // check if version is created_at more than 4 hours
    const isOlderEnought = (new Date(version.created_at || Date.now()).getTime() + 4 * 60 * 60 * 1000) < Date.now()

    if (!isOlderEnought && await invalidIp(xForwardedFor.split(',')[0])) {
      console.error('invalid ip', xForwardedFor)
      await sendStats('invalidIP', platform, device_id, app_id, version_build, version.id)
      return sendRes({ message: 'invalid ip' }, 400)
    }
    await updateOrCreateDevice({
      app_id,
      device_id,
      platform: platform as definitions['devices']['platform'],
      plugin_version,
      version: version.id,
      os_version: version_os,
      ...(is_emulator !== undefined ? { is_emulator } : {}),
      ...(is_prod !== undefined ? { is_prod } : {}),
      ...(custom_id ? { custom_id } : {}),
      version_build,
      updated_at: new Date().toISOString(),
    })
    // console.log('updateOrCreateDevice done')
    if (!planValid) {
      console.log(id, 'Cannot update, upgrade plan to continue to update', app_id)
      await sendStats('needPlanUpgrade', platform, device_id, app_id, version_build, version.id)
      return sendRes({
        message: 'Cannot update, upgrade plan to continue to update',
        err: 'not good plan',
      }, 200)
    }
    if (channelOverride) {
      console.log(id, 'Set channel override', app_id, channelOverride.channel_id.version.name)
      version = channelOverride.channel_id.version
      channel = channelOverride.channel_id
    }
    if (devicesOverride) {
      console.log(id, 'Set device override', app_id, devicesOverride.version.name)
      version = devicesOverride.version
    }

    if (!version.bucket_id && !version.external_url) {
      console.log(id, 'Cannot get zip file', app_id)
      return sendRes({
        message: 'Cannot get zip file',
      }, 200)
    }
    let signedURL = version.external_url || ''
    if (version.bucket_id && !version.external_url) {
      const res = await supabaseAdmin()
        .storage
        .from(`apps/${version.user_id}/${app_id}/versions`)
        .createSignedUrl(version.bucket_id, 60)
      if (res && res.signedURL)
        signedURL = res.signedURL
    }

    // console.log('signedURL', device_id, signedURL, version_name, version.name)
    if (version_name === version.name) {
      console.log(id, 'No new version available', device_id, version_name, version.name)
      await sendStats('noNew', platform, device_id, app_id, version_build, version.id)
      return sendRes({
        message: 'No new version available',
      }, 200)
    }

    // console.log('check disableAutoUpdateToMajor', device_id)
    if (!devicesOverride && !channel.ios && platform === 'ios') {
      console.log(id, 'Cannot update, ios is disabled', device_id)
      await sendStats('disablePlatformIos', platform, device_id, app_id, version_build, version.id)
      return sendRes({
        major: true,
        message: 'Cannot update, ios it\'s disabled',
        error: 'disabled_platform_ios',
        version: version.name,
        old: version_name,
      }, 200)
    }
    if (!devicesOverride && !channel.android && platform === 'android') {
      console.log(id, 'Cannot update, android is disabled', device_id)
      await sendStats('disablePlatformAndroid', platform, device_id, app_id, version_build, version.id)
      return sendRes({
        major: true,
        message: 'Cannot update, android is disabled',
        error: 'disabled_platform_android',
        version: version.name,
        old: version_name,
      }, 200)
    }
    if (!devicesOverride && channel.disableAutoUpdateToMajor && semver.major(version.name) > semver.major(version_name)) {
      console.log(id, 'Cannot upgrade major version', device_id)
      await sendStats('disableAutoUpdateToMajor', platform, device_id, app_id, version_build, version.id)
      return sendRes({
        major: true,
        message: 'Cannot upgrade major version',
        error: 'disable_auto_update_to_major',
        version: version.name,
        old: version_name,
      }, 200)
    }

    // console.log(id, 'check disableAutoUpdateUnderNative', device_id)
    if (!devicesOverride && channel.disableAutoUpdateUnderNative && semver.lt(version.name, version_build)) {
      console.log(id, 'Cannot revert under native version', device_id)
      await sendStats('disableAutoUpdateUnderNative', platform, device_id, app_id, version_build, version.id)
      return sendRes({
        message: 'Cannot revert under native version',
        error: 'disable_auto_update_under_native',
        version: version.name,
        old: version_name,
      }, 200)
    }

    if (!devicesOverride && !channel.allow_dev && !is_prod) {
      console.log(id, 'Cannot update dev build is disabled', device_id)
      await sendStats('disableDevBuild', platform, device_id, app_id, version_build, version.id)
      return sendRes({
        major: true,
        message: 'Cannot update, dev build is disabled',
        error: 'disable_dev_build',
        version: version.name,
        old: version_name,
      }, 200)
    }
    if (!devicesOverride && !channel.allow_emulator && is_emulator) {
      console.log(id, 'Cannot update emulator is disabled', device_id)
      await sendStats('disableEmulator', platform, device_id, app_id, version_build, version.id)
      return sendRes({
        major: true,
        message: 'Cannot update, emulator is disabled',
        error: 'disable_emulator',
        version: version.name,
        old: version_name,
      }, 200)
    }

    // console.log(id, 'save stats', device_id)
    await sendStats('get', platform, device_id, app_id, version_build, version.id)
    console.log(id, 'New version available', app_id, version.name, signedURL)
    return sendRes({
      version: version.name,
      session_key: version.session_key,
      ...(version.session_key ? { session_key: version.session_key } : {}),
      checksum: version.checksum,
      url: signedURL,
    })
  }
  catch (e) {
    console.log(id, 'Error', e)
    return sendRes({
      message: `Error unknow ${JSON.stringify(e)}`,
      error: 'unknow_error',
    }, 500)
  }
})
