import { useSyncExternalStore } from 'react'

import {
  getVisibleEvent,
  ADMIN_TEST_TIME_EVENT,
} from '../events/eventManager.js'
import { getChristmasCosmetics } from '../events/adventCalendar.js'

let snapshot = { now: new Date() }
const subscribers = new Set()
let intervalId = null

function updateTime() {
  snapshot = { now: new Date() }
  subscribers.forEach((subscriber) => subscriber())
}

function subscribe(subscriber) {
  subscribers.add(subscriber)

  if (subscribers.size === 1) {
    snapshot = { now: new Date() }
    intervalId = window.setInterval(updateTime, 30_000)
    document.addEventListener('visibilitychange', updateTime)
    window.addEventListener(ADMIN_TEST_TIME_EVENT, updateTime)
  }

  return () => {
    subscribers.delete(subscriber)

    if (subscribers.size === 0) {
      window.clearInterval(intervalId)
      intervalId = null
      document.removeEventListener('visibilitychange', updateTime)
      window.removeEventListener(ADMIN_TEST_TIME_EVENT, updateTime)
    }
  }
}

function getSnapshot() {
  return snapshot
}

export default function useChristmasCosmetics(profile) {
  const { now } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const event = getVisibleEvent(now, profile?.admin === true)

  return getChristmasCosmetics(profile, event)
}
