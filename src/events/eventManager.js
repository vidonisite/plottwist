const ADMIN_TEST_DATETIME_KEY = 'plot-twist-admin-test-datetime'
const CHRISTMAS_TEST_THEME_KEY = 'plot-twist-christmas-test-theme'

export const ADMIN_TEST_TIME_EVENT = 'plot-twist-admin-test-time-change'

const events = [
  {
    id: 'christmas',
    name: 'Christmas',
    startMonth: 12,
    startDay: 1,
    endMonth: 12,
    endDay: 26,
    bodyClass: 'christmas-theme',
  },
]

function makeDate(year, month, day) {
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

function getPreferenceKey(event, year) {
  return `plot-twist-event-${event.id}-${year}`
}

function getExpansionKey(event, year) {
  return `plot-twist-event-expanded-${event.id}-${year}`
}

function dispatchTestTimeChange() {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new Event(ADMIN_TEST_TIME_EVENT))
}

function readAdminTestDateTime() {
  try {
    const saved = localStorage.getItem(ADMIN_TEST_DATETIME_KEY)

    if (!saved) return null

    const parsed = JSON.parse(saved)

    if (
      !parsed ||
      !Number.isFinite(parsed.timestamp) ||
      !Number.isFinite(parsed.savedAt)
    ) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function formatDateTimeLocal(date) {
  const pad = (value) => String(value).padStart(2, '0')

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('')
}

/**
 * Returnerar den simulerade tiden för admin.
 * Simuleringen fortsätter framåt i samma takt som den riktiga klockan.
 * För alla andra användare returneras den riktiga tiden.
 */
export function getEffectiveNow(realNow = new Date(), isAdmin = false) {
  if (!isAdmin) {
    return new Date(realNow.getTime())
  }

  const saved = readAdminTestDateTime()

  if (!saved) {
    return new Date(realNow.getTime())
  }

  const elapsed = Math.max(0, realNow.getTime() - saved.savedAt)

  return new Date(saved.timestamp + elapsed)
}

/**
 * Hämtar datumet som ska visas i adminpanelens datumfält.
 */
export function getAdminTestDateTime(isAdmin = false) {
  if (!isAdmin) return ''

  const saved = readAdminTestDateTime()

  if (!saved) return ''

  const currentSimulatedTime = getEffectiveNow(new Date(), true)

  return formatDateTimeLocal(currentSimulatedTime)
}

/**
 * Sparar ett nytt simulerat datum och klockslag.
 * Funktionen gör ingenting om anroparen inte är admin.
 */
export function setAdminTestDateTime(value, isAdmin = false) {
  if (!isAdmin || typeof value !== 'string' || !value.trim()) {
    return false
  }

  const parsedDate = new Date(value)

  if (!Number.isFinite(parsedDate.getTime())) {
    return false
  }

  // Säkerställ att datumet faktiskt går att tolka som ett giltigt
  // lokalt datum och klockslag från datetime-local-fältet.
  const normalizedValue = formatDateTimeLocal(parsedDate)

  if (normalizedValue !== value) {
    return false
  }

  try {
    localStorage.setItem(
      ADMIN_TEST_DATETIME_KEY,
      JSON.stringify({
        timestamp: parsedDate.getTime(),
        savedAt: Date.now(),
      })
    )
  } catch {
    return false
  }

  dispatchTestTimeChange()
  return true
}

/**
 * Tar bort simuleringen och återgår till riktig tid.
 */
export function clearAdminTestDateTime(isAdmin = false) {
  if (!isAdmin) return

  try {
    localStorage.removeItem(ADMIN_TEST_DATETIME_KEY)
  } catch {
    // Appen kan fortfarande använda riktig tid under sessionen.
  }

  dispatchTestTimeChange()
}

/**
 * Behålls som hjälpfunktion för att kontrollera om admin
 * har aktiverat en simulerad tid.
 */
export function isChristmasTestMode(isAdmin = false) {
  if (!isAdmin) return false

  return readAdminTestDateTime() !== null
}

function getTestThemePreference() {
  try {
    const saved = localStorage.getItem(CHRISTMAS_TEST_THEME_KEY)

    return saved === null ? true : saved === 'true'
  } catch {
    return true
  }
}

export function getVisibleEvent(realNow = new Date(), isAdmin = false) {
  const now = getEffectiveNow(realNow, isAdmin)
  const testMode = isChristmasTestMode(isAdmin)
  const currentYear = now.getFullYear()

  for (const year of [currentYear, currentYear + 1]) {
    for (const event of events) {
      const startsAt = makeDate(year, event.startMonth, event.startDay)
      const endsAt = makeDate(year, event.endMonth, event.endDay)

      const countdownStartsAt = new Date(
        startsAt.getTime() - 24 * 60 * 60 * 1000
      )

      if (now >= countdownStartsAt && now < startsAt) {
        return {
          ...event,
          year,
          phase: 'upcoming',
          startsAt,
          endsAt,
          themeEnabled: false,
          testMode,
        }
      }

      if (now >= startsAt && now < endsAt) {
        let themeEnabled = true

        if (testMode && event.id === 'christmas') {
          themeEnabled = getTestThemePreference()
        } else {
          try {
            const saved = localStorage.getItem(
              getPreferenceKey(event, year)
            )

            if (saved !== null) {
              themeEnabled = saved === 'true'
            }
          } catch {
            // Standardinställningen är att temat är på.
          }
        }

        return {
          ...event,
          year,
          phase: 'active',
          startsAt,
          endsAt,
          themeEnabled,
          testMode,
        }
      }
    }
  }

  return null
}

export function setEventTheme(event, enabled, isAdmin = false) {
  if (!event) return

  // En simulerad inställning får bara ändras av admin.
  if (event.testMode && !isAdmin) return

  try {
    if (event.testMode && event.id === 'christmas') {
      localStorage.setItem(
        CHRISTMAS_TEST_THEME_KEY,
        String(enabled)
      )
      return
    }

    localStorage.setItem(
      getPreferenceKey(event, event.year),
      String(enabled)
    )
  } catch {
    // Temat kan fortfarande ändras under den aktuella sessionen.
  }
}

export function getExpansionEnd(event) {
  if (!event) return null

  try {
    const saved = localStorage.getItem(
      getExpansionKey(event, event.year)
    )

    if (saved === null) return null

    // Hanterar även gamla sparade värden.
    if (saved === 'true') return 0

    const timestamp = Number(saved)

    return Number.isFinite(timestamp) ? timestamp : 0
  } catch {
    return null
  }
}

export function hasShownExpansion(event) {
  return getExpansionEnd(event) !== null
}

export function markExpansionShown(event, duration = 5000) {
  if (!event) return 0

  const existingEnd = getExpansionEnd(event)

  if (existingEnd !== null) {
    return existingEnd
  }

  const endTime = Date.now() + duration

  try {
    localStorage.setItem(
      getExpansionKey(event, event.year),
      String(endTime)
    )
  } catch {
    // Om lagring inte fungerar används timern under aktuell session.
  }

  return endTime
}
