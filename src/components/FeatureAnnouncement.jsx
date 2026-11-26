import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import './FeatureAnnouncement.css'

const DOM_ANNOUNCEMENTS = [
  {
    announcementId: 'kaleidoscope',
    scopeSelector: '.camera-content',
    steps: [
      {
        targetSelector: '.camera-start-area',
        title: 'Starta kameran',
        description: 'Tryck här för att starta kameran. Sedan visar vi var Kalejdoskop-filtret finns.',
        isAvailable: ({ target }) => Boolean(target && !target.disabled),
        isComplete: ({ scope }) =>
          !scope.querySelector('.camera-start-area'),
      },
      {
        targetSelector: '.filter-option[title="Kalejdoskop"]',
        title: 'Nytt filter: Kalejdoskop',
        description: 'Välj Kalejdoskop för att spegla ena halvan av ansiktet.',
        isAvailable: ({ target }) => Boolean(target && !target.disabled),
        isComplete: ({ target }) =>
          Boolean(target?.classList.contains('selected')),
      },
    ],
  },
]

function getAnnouncementProgress(announcement) {
  const scope = document.querySelector(announcement.scopeSelector)
  if (!scope) {
    return { inScope: false, complete: false, step: null }
  }

  for (const step of announcement.steps) {
    const target = scope.querySelector(step.targetSelector)
    const state = { scope, target }

    if (step.isComplete(state)) continue

    return {
      inScope: true,
      complete: false,
      step: step.isAvailable(state) ? { ...step, target } : null,
    }
  }

  return { inScope: true, complete: true, step: null }
}

export default function FeatureAnnouncement({
  announcementId,
  userId,
  active,
  targetRef,
  title,
  description,
}) {
  const [seenState, setSeenState] = useState(null)
  const [domSeenState, setDomSeenState] = useState(null)
  const [domRevision, setDomRevision] = useState(0)
  const [position, setPosition] = useState(null)
  const announcementRef = useRef(null)
  const storageKey = userId
    ? `plot-twist:feature-announcement:${announcementId}:${userId}`
    : ''
  useEffect(() => {
    if (!userId) {
      setDomSeenState({ userId: null, seen: {} })
      return
    }

    const seen = {}

    DOM_ANNOUNCEMENTS.forEach((announcement) => {
      const key = `plot-twist:feature-announcement:${announcement.announcementId}:${userId}`

      try {
        seen[announcement.announcementId] =
          window.localStorage.getItem(key) === 'true'
      } catch (error) {
        console.error('Kunde inte läsa status för funktionsavisering:', error)
      }
    })

    setDomSeenState({ userId, seen })
  }, [userId])

  useEffect(() => {
    if (!userId || !document.body) return

    const observer = new MutationObserver(() => {
      setDomRevision((revision) => revision + 1)
    })

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'disabled'],
    })

    return () => observer.disconnect()
  }, [userId])

  const domProgress = useMemo(
    () =>
      DOM_ANNOUNCEMENTS.map((announcement) => ({
        announcement,
        ...getAnnouncementProgress(announcement),
      })),
    [domRevision],
  )

  useEffect(() => {
    if (domSeenState?.userId !== userId || !userId) return

    const newlyCompleted = domProgress.filter(
      ({ announcement, inScope, complete }) =>
        inScope && complete && !domSeenState.seen[announcement.announcementId],
    )

    if (newlyCompleted.length === 0) return

    const seen = { ...domSeenState.seen }

    newlyCompleted.forEach(({ announcement }) => {
      const key = `plot-twist:feature-announcement:${announcement.announcementId}:${userId}`

      try {
        window.localStorage.setItem(key, 'true')
      } catch (error) {
        console.error('Kunde inte spara status för funktionsavisering:', error)
      }

      seen[announcement.announcementId] = true
    })

    setDomSeenState({ userId, seen })
  }, [domProgress, domSeenState, userId])

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

  const activeDomAnnouncement = domSeenState?.userId === userId
    ? domProgress.find(
        ({ announcement, inScope }) =>
          inScope && !domSeenState.seen[announcement.announcementId],
      )
    : null
  const domStep = activeDomAnnouncement?.step
  const shouldShowDomAnnouncement = Boolean(domStep)
  const shouldShowLegacyAnnouncement =
    !activeDomAnnouncement &&
    Boolean(userId) &&
    !active &&
    seenState?.storageKey === storageKey &&
    !seenState.seen
  const shouldShow =
    shouldShowDomAnnouncement || shouldShowLegacyAnnouncement
  const displayTitle = shouldShowDomAnnouncement ? domStep.title : title
  const displayDescription = shouldShowDomAnnouncement
    ? domStep.description
    : description

  useLayoutEffect(() => {
    if (!shouldShow) {
      setPosition(null)
      return
    }

    const target = shouldShowDomAnnouncement
      ? domStep.target
      : targetRef?.current
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
  }, [
    shouldShow,
    shouldShowDomAnnouncement,
    domStep,
    domRevision,
    targetRef,
    displayTitle,
    displayDescription,
  ])

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
      <strong className="feature-announcement-title">{displayTitle}</strong>
      <p className="feature-announcement-description">{displayDescription}</p>
    </div>
  )

  return createPortal(announcement, document.body)
}
