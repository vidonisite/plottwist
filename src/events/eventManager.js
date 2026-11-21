
const CHRISTMAS_TEST_KEY = 'plot-twist-christmas-test'
const CHRISTMAS_TEST_THEME_KEY = 'plot-twist-christmas-test-theme'

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

export function isChristmasTestMode() {
  try {
    return localStorage.getItem(CHRISTMAS_TEST_KEY) === 'true'
  } catch {
    return false
  }
}

function getTestThemePreference() {
  try {
    const saved = localStorage.getItem(CHRISTMAS_TEST_THEME_KEY)
    return saved === null ? true : saved === 'true'
  } catch {
    return true
  }
}

export function getVisibleEvent(now = new Date()) {
  const testMode = isChristmasTestMode()
  const currentYear = now.getFullYear()

  for (const year of [currentYear, currentYear + 1]) {
    for (const event of events) {
      const startsAt = makeDate(year, event.startMonth, event.startDay)
      const endsAt = makeDate(year, event.endMonth, event.endDay)

      if (testMode && event.id === 'christmas') {
        return {
          ...event,
          year,
          phase: 'active',
          startsAt,
          endsAt,
          themeEnabled: getTestThemePreference(),
          testMode: true,
        }
      }

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
          testMode: false,
        }
      }

      if (now >= startsAt && now < endsAt) {
        let themeEnabled = true

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

        return {
          ...event,
          year,
          phase: 'active',
          startsAt,
          endsAt,
          themeEnabled,
          testMode: false,
        }
      }
    }
  }

  return null
}

export function setEventTheme(event, enabled) {
  if (!event) return

  try {
    if (event.testMode) {
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
