
import { useEffect, useState } from 'react'
import { Snowflake } from 'lucide-react'
import {
  getVisibleEvent,
  setEventTheme,
  hasShownExpansion,
  markExpansionShown,
} from './eventManager'
import './eventButton.css'

function getCountdown(target) {
  const difference = Math.max(0, target.getTime() - Date.now())

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

export default function EventButton({ disabled = false }) {
  const [now, setNow] = useState(() => new Date())
  const [expanded, setExpanded] = useState(false)
  const [themeEnabled, setThemeEnabled] = useState(true)

  const event = getVisibleEvent(now)

  useEffect(() => {
    function updateTime() {
      setNow(new Date())
    }

    const interval = setInterval(updateTime, 1000)

    document.addEventListener('visibilitychange', updateTime)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', updateTime)
    }
  }, [])

  useEffect(() => {
    if (!event || event.phase !== 'upcoming') {
      setExpanded(false)
      return
    }

    if (hasShownExpansion(event)) {
      setExpanded(false)
      return
    }

    markExpansionShown(event)
    setExpanded(true)

    const timeout = setTimeout(() => {
      setExpanded(false)
    }, 5000)

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

  const countdown = event.phase === 'upcoming'
    ? getCountdown(event.startsAt)
    : null

  function handleClick() {
    if (disabled || event.phase !== 'active' || event.testMode) {
      return
    }

    const nextValue = !themeEnabled

    setThemeEnabled(nextValue)
    setEventTheme(event, nextValue)
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
        event.phase === 'upcoming' ||
        event.testMode
      }
      aria-label={
        event.phase === 'upcoming'
          ? `Christmas starts in ${countdown}`
          : `Christmas theme ${themeEnabled ? 'on' : 'off'}`
      }
      title="Event"
    >
      <span className="event-button-icon">
        <Snowflake aria-hidden="true" />
      </span>

      {expanded && event.phase === 'upcoming' && (
        <span className="event-button-countdown">
          <span className="event-button-name">
            Christmas starts in
          </span>

          <span className="event-button-time">
            {countdown}
          </span>
        </span>
      )}
    </button>
  )
}
