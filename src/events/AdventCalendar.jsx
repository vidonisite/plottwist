import { useEffect, useState } from 'react'
import { CalendarDays, X } from 'lucide-react'

import {
  getEffectiveNow,
  getVisibleEvent,
  ADMIN_TEST_TIME_EVENT,
} from './eventManager'
import {
  ADVENT_REWARDS,
  getClaimedAdventDoors,
  isAdventDoorUnlocked,
} from './adventCalendar'

import './adventCalendar.css'

function getRewardText(reward) {
  if (reward.type === 'twist-score') {
    return `+${reward.points} Twist Score`
  }

  return reward.text
}

export default function AdventCalendar({
  profile,
  isAdmin = false,
  disabled = false,
  onClaimDoor,
}) {
  const [now, setNow] = useState(() => new Date())
  const [selectedDoor, setSelectedDoor] = useState(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isClaiming, setIsClaiming] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const event = getVisibleEvent(now, isAdmin)
  const activeEvent =
    event?.id === 'christmas' && event.phase === 'active' ? event : null
  const effectiveNow = getEffectiveNow(now, isAdmin)
  const claimedDoors = getClaimedAdventDoors(profile, activeEvent?.year)
  const selectedReward = selectedDoor
    ? ADVENT_REWARDS[selectedDoor - 1]
    : null
  const selectedIsClaimed = selectedDoor
    ? claimedDoors.includes(selectedDoor)
    : false
  const canClaim =
    Boolean(activeEvent && profile?.$id) &&
    !activeEvent.testMode &&
    !isClaiming

  useEffect(() => {
    function updateTime() {
      setNow(new Date())
    }

    const interval = window.setInterval(updateTime, 30_000)
    document.addEventListener('visibilitychange', updateTime)
    window.addEventListener(ADMIN_TEST_TIME_EVENT, updateTime)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', updateTime)
      window.removeEventListener(ADMIN_TEST_TIME_EVENT, updateTime)
    }
  }, [])

  useEffect(() => {
    if (!activeEvent) {
      setIsOpen(false)
      setSelectedDoor(null)
    }
  }, [activeEvent?.id, activeEvent?.year])

  useEffect(() => {
    if (!isOpen) return

    function closeOnEscape(keyboardEvent) {
      if (keyboardEvent.key === 'Escape') {
        setIsOpen(false)
        setSelectedDoor(null)
      }
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [isOpen])

  if (!activeEvent) return null

  async function handleClaim() {
    if (!canClaim || !selectedDoor || selectedIsClaimed) return

    setIsClaiming(true)
    setErrorMessage('')

    try {
      await onClaimDoor(selectedDoor)
    } catch (error) {
      setErrorMessage(
        error?.message || 'Luckan kunde inte öppnas. Försök igen.'
      )
    } finally {
      setIsClaiming(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="advent-calendar-launcher"
        onClick={() => {
          setIsOpen(true)
          setErrorMessage('')
        }}
        disabled={disabled}
        aria-label="Öppna julkalendern"
        title="Julkalender"
      >
        <CalendarDays aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          className="advent-calendar-backdrop"
          onMouseDown={(mouseEvent) => {
            if (mouseEvent.target === mouseEvent.currentTarget) {
              setIsOpen(false)
              setSelectedDoor(null)
            }
          }}
        >
          <section
            className="advent-calendar-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="advent-calendar-title"
            aria-describedby="advent-calendar-description"
          >
            <button
              type="button"
              className="advent-calendar-close"
              onClick={() => {
                setIsOpen(false)
                setSelectedDoor(null)
              }}
              aria-label="Stäng julkalendern"
            >
              <X aria-hidden="true" />
            </button>

            <header className="advent-calendar-heading">
              <span className="advent-calendar-kicker">Juleventet</span>
              <h2 id="advent-calendar-title">Julkalender</h2>
              <p id="advent-calendar-description">
                Öppna dagens lucka eller ta igen en tidigare lucka.
              </p>
            </header>

            {activeEvent.testMode && (
              <p className="advent-calendar-notice">
                Testläge: luckor kan förhandsvisas men belöningar delas inte ut.
              </p>
            )}

            <div className="advent-calendar-grid">
              {ADVENT_REWARDS.map((reward) => {
                const isUnlocked = isAdventDoorUnlocked(
                  reward.day,
                  effectiveNow
                )
                const isClaimed = claimedDoors.includes(reward.day)

                return (
                  <button
                    type="button"
                    key={reward.day}
                    className={[
                      'advent-calendar-door',
                      isUnlocked ? 'is-unlocked' : 'is-locked',
                      isClaimed ? 'is-claimed' : '',
                      selectedDoor === reward.day ? 'is-selected' : '',
                    ].filter(Boolean).join(' ')}
                    disabled={!isUnlocked}
                    onClick={() => {
                      setSelectedDoor(reward.day)
                      setErrorMessage('')
                    }}
                    aria-label={`Lucka ${reward.day}${
                      isClaimed ? ', öppnad' : isUnlocked ? ', tillgänglig' : ', låst'
                    }`}
                  >
                    <span className="advent-calendar-door-number">
                      {reward.day}
                    </span>
                    <span className="advent-calendar-door-status">
                      {isClaimed ? 'Öppnad' : isUnlocked ? 'Öppna' : 'Låst'}
                    </span>
                  </button>
                )
              })}
            </div>

            {selectedReward && (
              <div className="advent-calendar-reward" aria-live="polite">
                <strong>Lucka {selectedDoor}</strong>
                <p>
                  {selectedIsClaimed || activeEvent.testMode
                    ? selectedIsClaimed
                      ? `Du har redan öppnat luckan: ${getRewardText(selectedReward)}`
                      : getRewardText(selectedReward)
                    : 'Öppna luckan för att se innehållet.'}
                </p>

                {!selectedIsClaimed && (
                  <button
                    type="button"
                    className="advent-calendar-claim"
                    onClick={handleClaim}
                    disabled={!canClaim}
                  >
                    {isClaiming ? 'Öppnar...' : 'Öppna luckan'}
                  </button>
                )}
              </div>
            )}

            {errorMessage && (
              <p className="advent-calendar-error" role="alert">
                {errorMessage}
              </p>
            )}
          </section>
        </div>
      )}
    </>
  )
}
