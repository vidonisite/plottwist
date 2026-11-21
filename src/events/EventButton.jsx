import { useEffect, useState } from 'react'
import { Snowflake } from 'lucide-react'

import {
  getVisibleEvent,
  getEffectiveNow,
  setEventTheme,
  getExpansionEnd,
  markExpansionShown,
  ADMIN_TEST_TIME_EVENT,
} from './eventManager'

import './eventButton.css'

function getCountdown(target, currentTime) {
  const difference = Math.max(
    0,
    target.getTime() - currentTime.getTime()
  )

  const totalSeconds = Math.floor(difference / 1000)

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(seconds).padStart(2, '0'),
  ].join(':')
}

export default function EventButton({
  disabled = false,
  isAdmin = false,
}) {
  const [now, setNow] = useState(() => new Date())
  const [expanded, setExpanded] = useState(false)
  const [themeEnabled, setThemeEnabled] = useState(true)

  const effectiveNow = getEffectiveNow(now, isAdmin)
  const event = getVisibleEvent(now, isAdmin)

  useEffect(() => {
    function updateTime() {
      setNow(new Date())
    }

    const interval = setInterval(updateTime, 1000)

    document.addEventListener('visibilitychange', updateTime)

    window.addEventListener(ADMIN_TEST_TIME_EVENT, updateTime)

    return () => {
      clearInterval(interval)

      document.removeEventListener(
        'visibilitychange',
        updateTime
      )

      window.removeEventListener(
        ADMIN_TEST_TIME_EVENT,
        updateTime
      )
    }
  }, [])

  useEffect(() => {
    if (!event || event.phase !== 'upcoming') {
      setExpanded(false)
      return
    }

    let endTime = getExpansionEnd(event)

    if (endTime === null) {
      endTime = markExpansionShown(event, 5000)
    }

    const remaining = Math.max(0, endTime - Date.now())

    if (remaining <= 0) {
      setExpanded(false)
      return
    }

    setExpanded(true)

    const timeout = setTimeout(() => {
      setExpanded(false)
    }, remaining)

    return () => clearTimeout(timeout)
  }, [event?.id, event?.year, event?.phase])

  useEffect(() => {
    if (event?.phase === 'active') {
      setThemeEnabled(event.themeEnabled)
    }
  }, [
    event?.id,
    event?.year,
    event?.phase,
    event?.themeEnabled,
  ])

  if (!event) return null

  const countdown =
    event.phase === 'upcoming'
      ? getCountdown(event.startsAt, effectiveNow)
      : null

  function handleClick() {
    if (disabled || event.phase !== 'active') return

    const nextValue = !themeEnabled

    setThemeEnabled(nextValue)
    setEventTheme(event, nextValue, isAdmin)
  }

  return (
    <button
      type="button"
      className={[
        'event-button',
        `event-button-${event.id}`,
        expanded && event.phase === 'upcoming'
          ? 'event-button-expanded'
          : '',
        themeEnabled && event.phase === 'active'
          ? 'event-button-enabled'
          : '',
      ].filter(Boolean).join(' ')}
      onClick={handleClick}
      disabled={
        disabled ||
        event.phase === 'upcoming'
      }
      aria-label={
        event.phase === 'upcoming'
          ? `${event.name} starts in ${countdown}`
          : `${event.name} theme ${themeEnabled ? 'on' : 'off'}`
      }
      title="Event"
    >
      <span className="event-button-icon">
        <Snowflake aria-hidden="true" />
      </span>

      {expanded && event.phase === 'upcoming' && (
        <span className="event-button-countdown">
          <span className="event-button-name">
            {event.name} starts in
          </span>

          <span className="event-button-time">
            {countdown}
          </span>
        </span>
      )}
    </button>
  )
}
