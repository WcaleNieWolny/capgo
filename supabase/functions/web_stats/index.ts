import { serve } from 'https://deno.land/std@0.147.0/http/server.ts'
import { supabaseAdmin } from '../_utils/supabase.ts'
import type { definitions } from '../_utils/types_supabase.ts'
import { sendRes } from '../_utils/utils.ts'

interface GlobalStats {
  apps: PromiseLike<number>
  updates: PromiseLike<number>
  stars: Promise<number>
}

const getGithubStars = async (): Promise<number> => {
  const res = await fetch('https://api.github.com/repos/Cap-go/capacitor-updater')
  const json = await res.json()
  return json.stargazers_count
}

const getStats = (): GlobalStats => {
  return {
    apps: supabaseAdmin.rpc<number>('count_all_apps', {}).single().then((res) => {
      if (res.error || !res.data)
        console.log('count_all_apps', res.error)
      return res.data || 0
    }),
    updates: supabaseAdmin.rpc<number>('count_all_updates', {}).single().then((res) => {
      if (res.error || !res.data)
        console.log('count_all_updates', res.error)
      return res.data || 0
    }),
    stars: getGithubStars(),
  }
}
serve(async (event: Request) => {
  const supabase = supabaseAdmin
  const API_SECRET = Deno.env.get('API_SECRET')
  const authorizationSecret = event.headers.get('apisecret')
  if (!authorizationSecret) {
    console.log('Cannot find authorization secret')
    return sendRes({ status: 'Cannot find authorization secret' }, 400)
  }
  if (!authorizationSecret || !API_SECRET || authorizationSecret !== API_SECRET) {
    console.log('Fail Authorization', authorizationSecret, API_SECRET)
    return sendRes({ message: 'Fail Authorization', authorizationSecret, API_SECRET }, 400)
  }
  try {
    const res = getStats()
    const [apps, updates, stars] = await Promise.all([res.apps, res.updates, res.stars])
    // console.log('app', app.app_id, downloads, versions, shared, channels)
    // create var date_id with yearn-month
    const now = new Date()
    // get_current_plan_name
    // get month with leading zero
    const month = now.getMonth() + 1 < 10 ? `0${now.getMonth() + 1}` : `${now.getMonth() + 1})`
    // get day
    const day = now.getDate() < 10 ? `0${now.getDate()}` : `${now.getDate()}`
    const newData: definitions['global_stats'] = {
      date_id: `${now.getFullYear()}-${month}-${day}`,
      apps,
      updates,
      stars,
    }
    // console.log('newData', newData)
    await supabase
      .from<definitions['global_stats']>('global_stats')
      .upsert(newData)
    return sendRes()
  }
  catch (e) {
    console.log('Error', e)
    return sendRes({
      status: 'Error unknow',
      error: JSON.stringify(e),
    }, 500)
  }
})
