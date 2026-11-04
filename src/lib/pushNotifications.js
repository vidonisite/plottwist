import { functions } from './appwrite.js'

const PUSH_FUNCTION_ID = import.meta.env.VITE_APPWRITE_PUSH_FUNCTION_ID
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export const pushNotificationsSupported =
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

function decodeVapidPublicKey(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)

  return Uint8Array.from(rawData, (character) => character.charCodeAt(0))
}

async function executePushFunction(action, subscription) {
  if (!PUSH_FUNCTION_ID) {
    throw new Error('Pushfunktionen är inte konfigurerad.')
  }

  const execution = await functions.createExecution({
    functionId: PUSH_FUNCTION_ID,
    body: JSON.stringify({
      action,
      subscription: subscription.toJSON(),
    }),
    async: false,
  })

  if (execution.responseStatusCode < 200 || execution.responseStatusCode >= 300) {
    throw new Error(
      `Pushfunktionen svarade med status ${execution.responseStatusCode}.`
    )
  }
}

export async function getPushSubscription() {
  if (!pushNotificationsSupported) return null

  const registration = await navigator.serviceWorker.getRegistration()
  return registration?.pushManager.getSubscription() ?? null
}

export async function registerPushSubscription(subscription) {
  await executePushFunction('subscribe', subscription)
}

export async function enablePushNotifications() {
  if (!pushNotificationsSupported) {
    throw new Error('Den här webbläsaren stöder inte pushnotiser.')
  }

  if (!PUSH_FUNCTION_ID || !VAPID_PUBLIC_KEY) {
    throw new Error('Pushnotiser är inte färdigkonfigurerade för appen.')
  }

  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission()

    if (permission !== 'granted') {
      throw new Error('Tillstånd för notiser nekades i webbläsaren.')
    }
  }

  const registration = await navigator.serviceWorker.ready
  const existingSubscription = await registration.pushManager.getSubscription()
  const subscription =
    existingSubscription ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidPublicKey(VAPID_PUBLIC_KEY),
    }))

  try {
    await registerPushSubscription(subscription)
    return subscription
  } catch (error) {
    if (!existingSubscription) {
      await subscription.unsubscribe()
    }
    throw error
  }
}

export async function disablePushNotifications() {
  const subscription = await getPushSubscription()

  if (!subscription) return

  await executePushFunction('unsubscribe', subscription)
  await subscription.unsubscribe()
}
