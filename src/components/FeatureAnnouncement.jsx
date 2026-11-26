import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import './FeatureAnnouncement.css'

export default function FeatureAnnouncement({
  announcementId,
  userId,
  active,
  targetRef,
  title,
  description,
}) {
  const [seenState, setSeenState] = useState(null)
  const [position, setPosition] = useState(null)
  const announcementRef = useRef(null)
  const storageKey = userId
    ? `plot-twist:feature-announcement:${announcementId}:${userId}`
    : ''
  const shouldShow =
    Boolean(userId) &&
    !active &&
    seenState?.storageKey === storageKey &&
    !seenState.seen

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

  useLayoutEffect(() => {
    if (!shouldShow) {
      setPosition(null)
      return
    }

    const target = targetRef?.current
    const announcement = announcementRef.current

    if (!target || !announcement) {
      return
    }

    const updatePosition = () => {
      const targetBounds = target.getBoundingClientRect()
      const announcementBounds = announcement.getBoundingClientRect()
      const viewportWidth = document.documentElement.clientWidth
      const viewportHeight = document.documentElement.clientHeight
      const edgeGap = 12
      const targetGap = 12
      const fitsLeft =
        targetBounds.right - edgeGap >= announcementBounds.width
      const fitsRight =
        viewportWidth - targetBounds.left - edgeGap >= announcementBounds.width
      const opensLeft = fitsLeft
        ? !fitsRight || targetBounds.left > viewportWidth / 2
        : targetBounds.left > viewportWidth / 2
      const fitsAbove =
        targetBounds.top - targetGap >= announcementBounds.height + edgeGap
      const fitsBelow =
        viewportHeight - targetBounds.bottom - targetGap >=
        announcementBounds.height + edgeGap
      const opensAbove = fitsAbove
        ? true
        : fitsBelow
          ? false
          : targetBounds.top > viewportHeight / 2
      const left = opensLeft
        ? targetBounds.right - announcementBounds.width
        : targetBounds.left
      const top = opensAbove
        ? targetBounds.top - announcementBounds.height - targetGap
        : targetBounds.bottom + targetGap
      const maxLeft = Math.max(
        edgeGap,
        viewportWidth - announcementBounds.width - edgeGap,
      )
      const maxTop = Math.max(
        edgeGap,
        viewportHeight - announcementBounds.height - edgeGap,
      )
      const visibleLeft = Math.min(maxLeft, Math.max(edgeGap, left))
      const arrowLeft = Math.min(
        announcementBounds.width - 12,
        Math.max(12, targetBounds.left + targetBounds.width / 2 - visibleLeft),
      )

      setPosition({
        left: visibleLeft,
        top: Math.min(maxTop, Math.max(edgeGap, top)),
        arrowLeft,
        opensAbove,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [shouldShow, targetRef, title, description])

  if (!shouldShow) {
    return null
  }

  const announcement = (
    <div
      ref={announcementRef}
      className={`feature-announcement${
        position?.opensAbove ? '' : ' feature-announcement--opens-below'
      }`}
      role="status"
      aria-live="polite"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        '--announcement-arrow-left': `${position?.arrowLeft ?? 0}px`,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      <span className="feature-announcement-label">Nytt</span>
      <strong className="feature-announcement-title">{title}</strong>
      <p className="feature-announcement-description">{description}</p>
    </div>
  )

  return createPortal(announcement, document.body)
}
