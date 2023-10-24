import type { User } from '@supabase/supabase-js'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'
import {
  unspoofUser,
} from './../services/supabase'
import { useSupabase } from '~/services/supabase'
import type { Database } from '~/types/supabase.types'
import { reset } from '~/services/chatwoot'

interface appUsage {
  app_id: string
  bandwidth: number
  date: string
  fail: number
  get: number
  install: number
  mau: number
  storage_added: number
  storage_deleted: number
  uninstall: number
}
export const useMainStore = defineStore('main', () => {
  const auth = ref<User | undefined>()
  const path = ref('')
  const user = ref<Database['public']['Tables']['users']['Row']>()
  const cycleInfo = ref<{
    subscription_anchor_start: string
    subscription_anchor_end: string
  }>()
  const trialDaysLeft = ref<number>(0)
  const paying = ref<boolean>(false)
  const canceled = ref<boolean>(false)
  const goodPlan = ref<boolean>(false)
  const canUseMore = ref<boolean>(false)
  const dashboard = ref<appUsage[]>([])
  const totalDevices = ref<number>(0)
  const totalDownload = ref<number>(0)

  const logout = () => {
    return new Promise<void>((resolve) => {
      const supabase = useSupabase()
      supabase.auth.onAuthStateChange((event: any) => {
        if (event === 'SIGNED_OUT') {
          auth.value = undefined
          user.value = undefined
          reset()
          unspoofUser()
          resolve()
        }
      })
      // deleteSupabaseToken()
      setTimeout(() => {
        supabase.auth.signOut()
      }, 300)
    })
  }
  const getAllDashboard = async (rangeStart?: Date, rangeEnd?: Date) => {
    const supabase = useSupabase()

    const req = await supabase.functions.invoke('get_dashboard', {
      body: {
        rangeStart: cycleInfo.value?.subscription_anchor_start || rangeStart,
        rangeEnd: cycleInfo.value?.subscription_anchor_end || rangeEnd,
      },
    })
    dashboard.value = (req.data || []) as appUsage[]
    totalDevices.value = dashboard.value.reduce((acc: number, cur: any) => acc + cur.mau, 0)
    totalDownload.value = dashboard.value.reduce((acc: number, cur: any) => acc + cur.get, 0)
  }

  const filterDashboard = async (appId: string, rangeStart?: Date, rangeEnd?: Date, refetch = false) => {
    if (refetch)
      await getAllDashboard(rangeStart, rangeEnd)

    return dashboard.value.filter(d => d.app_id === appId)
  }

  return {
    auth,
    trialDaysLeft,
    goodPlan,
    getAllDashboard,
    filterDashboard,
    dashboard,
    canceled,
    canUseMore,
    paying,
    user,
    cycleInfo,
    path,
    logout,
  }
})

if (import.meta.hot)
  import.meta.hot.accept(acceptHMRUpdate(useMainStore, import.meta.hot))
