
import { useEffect, useState } from 'react'
import {
  getVisibleEvent,
  setEventTheme,
} from './eventManager'
import './eventButton.css'
import './themes/christmas.css'

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
  const [expanded, setExpanded] = useState(true)
  const [themeEnabled, setThemeEnabled] = useState(true)

  const event = getVisibleEvent(now)

  // Uppdatera klockan och eventstatusen varje sekund
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // Expandera automatiskt när knappen visas
  useEffect(() => {
    if (!event) return

    setExpanded(true)

    const timeout = setTimeout(() => {
      setExpanded(false)
    }, 5000)

    return () => clearTimeout(timeout)
  }, [event?.id, event?.year, event?.phase])

  // Läs in användarens sparade temainställning
  useEffect(() => {
    if (event?.phase === 'active') {
      setThemeEnabled(event.themeEnabled)
    }
  }, [event?.id, event?.year, event?.phase])

  // Lägg till eller ta bort eventets tema
  useEffect(() => {
    if (!event) return

    document.body.classList.toggle(
      event.bodyClass,
      event.phase === 'active' && themeEnabled
    )

    return () => {
      document.body.classList.remove(event.bodyClass)
    }
  }, [event?.id, event?.year, event?.phase, event?.bodyClass, themeEnabled])

  if (!event) return null

  const EventIcon = event.icon
  const isUpcoming = event.phase === 'upcoming'
  const countdown = isUpcoming
    ? getCountdown(event.startsAt)
    : null

  function handleClick() {
    if (disabled || isUpcoming) return

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
        expanded && isUpcoming ? 'event-button-expanded' : '',
        themeEnabled && !isUpcoming ? 'event-button-enabled' : '',
      ].filter(Boolean).join(' ')}
      onClick={handleClick}
      disabled={disabled || isUpcoming}
      aria-label={
        isUpcoming
          ? `${event.name} börjar om ${countdown}`
          : `${event.name}: tema ${themeEnabled ? 'på' : 'av'}`
      }
      title={event.name}
    >
      <span className="event-button-icon">
        <EventIcon aria-hidden="true" />
      </span>

      {expanded && isUpcoming && (
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
