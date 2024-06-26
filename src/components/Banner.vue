<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { Capacitor } from '@capacitor/core'
import { useRoute } from 'vue-router'
import { urlToAppId } from '~/services/conversion'

import { useMainStore } from '~/stores/main'
import { type Organization, useOrganizationStore } from '~/stores/organization'
import InformationInfo from '~icons/heroicons/information-circle-solid'
import { useDisplayStore } from '~/stores/display'

defineProps({
  text: { type: String, default: '' },
  color: { type: String, default: '' },
})
const main = useMainStore()
const { t } = useI18n()
const organizationStore = useOrganizationStore()
const displayStore = useDisplayStore()

const route = useRoute()
const appId = ref('')
const organization = ref(null as null | Organization)
const isOrgOwner = ref(false)

watchEffect(() => {
  try {
    if (route.path.includes('/app') && !route.path.includes('home')) {
      const appIdRaw = route.params.p as string || route.params.package as string
      if (!appIdRaw) {
        console.error('cannot get app id. Parms:', route.params)
        return
      }

      appId.value = urlToAppId(appIdRaw)
      organization.value = organizationStore.getOrgByAppId(appId.value) ?? null
    }
    else if (route.path.includes('/app') && route.path.includes('home')) {
      appId.value = ''
      organization.value = null
    }

    isOrgOwner.value = !!organization.value && organization.value.created_by === main.user?.id
  }
  catch (ed) {
    console.error('Cannot figure out app_id for banner', ed)
  }
})

const isMobile = Capacitor.isNativePlatform()

const bannerText = computed(() => {
  const org = organization.value
  if (!org)
    return

  if (org.is_canceled)
    return t('plan-inactive')

  else if (!org.paying && org.trial_left > 1)
    return `${org.trial_left} ${t('trial-left')}`

  else if (!org.paying && org.trial_left === 1)
    return t('one-day-left')

  else if (!org.paying && !org.can_use_more)
    return t('trial-plan-expired')

  else if (org.paying && !org.can_use_more)
    return t('you-reached-the-limi')

  return null
})
const bannerColor = computed(() => {
  const warning = 'bg-warning'
  // bg-ios-light-surface-2 dark:bg-ios-dark-surface-2
  const success = 'bg-success'

  const org = organization.value
  if (!org)
    return

  if (org.paying && org.can_use_more)
    return ''

  else if (org.is_canceled)
    return warning

  else if (!org.paying && org.trial_left > 1 && org.trial_left <= 7)
    return warning

  else if (!org.paying && org.trial_left === 1)
    return warning

  else if (!org.paying && !org.can_use_more)
    return warning

  else if (org.paying && !org.can_use_more)
    return warning

  return success
})

function showInfo() {
  displayStore.dialogOption = {
    header: t('warning'),
    message: t('dialog-warning-msg'),
  }

  displayStore.showDialog = true
}
</script>

<template>
  <div v-if="bannerText" class="navbar" :class="bannerColor">
    <div class="navbar-start" />
    <div class="navbar-center lg:flex">
      <a class="text-xl font-bold text-black normal-case">{{ bannerText }}</a>
    </div>
    <div class="navbar-end">
      <a v-if="isOrgOwner" href="/dashboard/settings/plans" class="btn">{{ isMobile ? t('see-usage') : t('upgrade') }}</a>
      <button v-else class="ml-3 mr-3" @click="showInfo">
        <InformationInfo class="h-10 rounded-full w-10 bg-[#252b36]" />
      </button>
    </div>
  </div>
</template>
