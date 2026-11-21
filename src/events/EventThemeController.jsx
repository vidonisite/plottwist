import { useEffect, useState } from 'react'

import {
  getVisibleEvent,
  getAdminTestDateTime,
  setAdminTestDateTime,
  clearAdminTestDateTime,
  ADMIN_TEST_TIME_EVENT,
} from './eventManager'

import './themes/christmas.css'

export default function EventThemeController() {
  const [isVisible, setIsVisible] = useState(false)

  const [testDateTime, setTestDateTime] = useState(() =>
    getAdminTestDateTime(true)
  )

  const [testActive, setTestActive] = useState(() =>
    Boolean(getAdminTestDateTime(true))
  )

  const [message, setMessage] = useState('')

  // Gör simulatorn tillgänglig via webbläsarens Console.
  useEffect(() => {
    const simulatorApi = {
      show: () => setIsVisible(true),
      hide: () => setIsVisible(false),
    }

    window.plotTwistEventSimulator = simulatorApi

    return () => {
      if (window.plotTwistEventSimulator === simulatorApi) {
        delete window.plotTwistEventSimulator
      }
    }
  }, [])

  useEffect(() => {
    function updateTheme() {
      const event = getVisibleEvent(new Date(), true)

      document.body.classList.toggle(
        'christmas-theme',
        Boolean(
          event?.id === 'christmas' &&
          event.phase === 'active' &&
          event.themeEnabled
        )
      )
    }

    updateTheme()

    const interval = setInterval(updateTheme, 1000)

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        updateTheme()
      }
    }

    function handleTestTimeChange() {
      setTestDateTime(getAdminTestDateTime(true))
      setTestActive(Boolean(getAdminTestDateTime(true)))
      setMessage('')
      updateTheme()
    }

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange
    )

    window.addEventListener(
      ADMIN_TEST_TIME_EVENT,
      handleTestTimeChange
    )

    return () => {
      clearInterval(interval)

      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      )

      window.removeEventListener(
        ADMIN_TEST_TIME_EVENT,
        handleTestTimeChange
      )

      document.body.classList.remove('christmas-theme')
    }
  }, [])

  function handleApply() {
    if (!testDateTime) {
      setMessage('Välj ett datum och klockslag först.')
      return
    }

    const saved = setAdminTestDateTime(testDateTime, true)

    if (!saved) {
      setMessage('Datumet kunde inte sparas. Kontrollera värdet.')
      return
    }

    setTestActive(true)
    setMessage('Testtiden är aktiverad.')
  }

  function handleClear() {
    clearAdminTestDateTime(true)

    setTestDateTime('')
    setTestActive(false)
    setMessage('Simuleringen är avstängd.')
  }

  if (!isVisible) return null

  return (
    <aside
      style={{
        position: 'fixed',
        top: '12px',
        right: '12px',
        zIndex: 10000,
        width: 'min(310px, calc(100vw - 24px))',
        padding: '14px',
        borderRadius: '16px',
        background: '#fff',
        color: '#320E3B',
        boxShadow: '0 5px 24px rgba(0, 0, 0, 0.2)',
        border: '1px solid #eadcf4',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          marginBottom: '10px',
        }}
      >
        <strong style={{ fontSize: '14px' }}>
          Event time simulator
        </strong>

        <button
          type="button"
          onClick={() => setIsVisible(false)}
          aria-label="Hide event time simulator"
          style={{
            border: 0,
            background: 'transparent',
            color: '#766b7b',
            fontSize: '20px',
            lineHeight: 1,
            cursor: 'pointer',
            padding: '0 3px',
          }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '10px',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 600 }}>
          Simulation status
        </span>

        <span
          style={{
            padding: '4px 8px',
            borderRadius: '999px',
            background: testActive ? '#e2f5e8' : '#f1edf3',
            color: testActive ? '#267344' : '#766b7b',
            fontSize: '11px',
            fontWeight: 700,
          }}
        >
          {testActive ? 'ACTIVE' : 'OFF'}
        </span>
      </div>

      <label
        htmlFor="admin-event-test-datetime"
        style={{
          display: 'block',
          marginBottom: '6px',
          fontSize: '12px',
          fontWeight: 600,
        }}
      >
        Simulated date and time
      </label>

      <input
        id="admin-event-test-datetime"
        type="datetime-local"
        value={testDateTime || ''}
        onChange={(event) => {
          setTestDateTime(event.target.value)
          setMessage('')
        }}
        style={{
          width: '100%',
          minWidth: 0,
          padding: '9px',
          border: '1px solid #d9c9e2',
          borderRadius: '9px',
          boxSizing: 'border-box',
          color: '#320E3B',
          background: '#fff',
          font: 'inherit',
          fontSize: '13px',
        }}
      />

      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginTop: '10px',
        }}
      >
        <button
          type="button"
          onClick={handleApply}
          style={{
            flex: 1,
            padding: '9px 10px',
            border: 0,
            borderRadius: '9px',
            background: '#8C52FF',
            color: '#fff',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Apply
        </button>

        <button
          type="button"
          onClick={handleClear}
          disabled={!testActive}
          style={{
            padding: '9px 10px',
            border: '1px solid #e0d5e7',
            borderRadius: '9px',
            background: '#f8f5fa',
            color: '#49394f',
            fontWeight: 600,
            cursor: testActive ? 'pointer' : 'not-allowed',
            opacity: testActive ? 1 : 0.5,
          }}
        >
          Reset
        </button>
      </div>

      {message && (
        <p
          role="status"
          style={{
            margin: '9px 0 0',
            fontSize: '12px',
            color: '#65556d',
          }}
        >
          {message}
        </p>
      )}

      <p
        style={{
          margin: '9px 0 0',
          fontSize: '11px',
          lineHeight: 1.4,
          color: '#82758a',
        }}
      >
        This only changes the event time in this browser.
      </p>
    </aside>
  )
}
