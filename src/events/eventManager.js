
const CHRISTMAS_TEST_KEY = 'plot-twist-christmas-test'

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

export function getVisibleEvent(now = new Date()) {
  const testMode = isChristmasTestMode()
  const currentYear = now.getFullYear()

  for (const year of [currentYear, currentYear + 1]) {
    for (const event of events) {
      const startsAt = makeDate(year, event.startMonth, event.startDay)
      const endsAt = makeDate(year, event.endMonth, event.endDay)

      // Testläget visar julknappen och aktiverar jultemat året runt.
      if (testMode && event.id === 'christmas') {
        return {
          ...event,
          year,
          phase: 'active',
          startsAt,
          endsAt,
          themeEnabled: true,
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
  if (!event || event.testMode) return

  try {
    localStorage.setItem(
      getPreferenceKey(event, event.year),
      String(enabled)
    )
  } catch {
    // Temat kan fortfarande ändras under den aktuella sessionen.
  }
}

export function hasShownExpansion(event) {
  if (!event) return true

  try {
    return localStorage.getItem(
      getExpansionKey(event, event.year)
    ) === 'true'
  } catch {
    return false
  }
}

export function markExpansionShown(event) {
  if (!event) return

  try {
    localStorage.setItem(
      getExpansionKey(event, event.year),
      'true'
    )
  } catch {
    // Om lagring inte fungerar kan animationen visas igen vid nästa besök.
  }
}
