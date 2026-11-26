import { useEffect, useState } from 'react'

import './FeatureAnnouncement.css'

export default function FeatureAnnouncement({
  announcementId,
  userId,
  active,
  title,
  description,
}) {
  const [seenState, setSeenState] = useState(null)
  const storageKey = userId
    ? `plot-twist:feature-announcement:${announcementId}:${userId}`
    : ''

  useEffect(() => {
    if (!storageKey) {
      setSeenState(null)
      return
    }

    let seen = false

    try {
      seen = window.localStorage.getItem(storageKey) === 'true'
    } catch (error) {
      console.error('Kunde inte läsa status för funktionsavisering:', error)
    }

    setSeenState({ storageKey, seen })
  }, [storageKey])

  useEffect(() => {
    if (
      !active ||
      !storageKey ||
      seenState?.storageKey !== storageKey ||
      seenState.seen
    ) {
      return
    }

    try {
      window.localStorage.setItem(storageKey, 'true')
    } catch (error) {
      console.error('Kunde inte spara status för funktionsavisering:', error)
    }

    setSeenState({ storageKey, seen: true })
  }, [active, storageKey, seenState])

  if (
    !userId ||
    active ||
    seenState?.storageKey !== storageKey ||
    seenState.seen
  ) {
    return null
  }

  return (
    <div className="feature-announcement" role="status" aria-live="polite">
      <span className="feature-announcement-label">Nytt</span>
      <strong className="feature-announcement-title">{title}</strong>
      <p className="feature-announcement-description">{description}</p>
    </div>
  )
}
