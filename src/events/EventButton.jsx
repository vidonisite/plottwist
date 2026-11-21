
import { useEffect, useState } from 'react'
import { Snowflake } from 'lucide-react'

import {
  getVisibleEvent,
  setEventTheme,
  getExpansionEnd,
  markExpansionShown,
} from './eventManager'

import './eventButton.css'

function getCountdown(target) {
  const difference = Math.max(
    0,
    target.getTime() - Date.now()
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

export default function EventButton({ disabled = false }) {
  const [now, setNow] = useState(() => new Date())
  const [expanded, setExpanded] = useState(false)
  const [themeEnabled, setThemeEnabled] = useState(true)

  const event = getVisibleEvent(now)

  // Uppdaterar klockan varje sekund.
  // Nedräkningen baseras alltid på det riktiga startdatumet.
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

  // Visar den expanderade knappen i totalt fem sekunder.
  // Tiden sparas så att den inte börjar om vid avmontering.
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

    return () => {
      clearTimeout(timeout)
    }
  }, [event?.id, event?.year, event?.phase])

  // Hämtar aktuell temainställning när eventet blir aktivt.
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

  const expandedClass =
    expanded && event.phase === 'upcoming'
      ? 'event-button-expanded'
      : ''

  const enabledClass =
    themeEnabled && event.phase === 'active'
      ? 'event-button-enabled'
      : ''

  return (
    <button
      type="button"
      className={[
        'event-button',
        `event-button-${event.id}`,
        expandedClass,
        enabledClass,
      ].filter(Boolean).join(' ')}
      onClick={handleClick}
      disabled={
        disabled ||
        event.phase === 'upcoming' ||
        event.testMode
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
