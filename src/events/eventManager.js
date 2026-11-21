
import { Snowflake } from 'lucide-react'

const events = [
  {
    id: 'christmas',
    name: 'Christmas',
    icon: Snowflake,

    // December 1–25
    startMonth: 12,
    startDay: 1,
    endMonth: 12,
    endDay: 26,

    // Temat som används på body
    bodyClass: 'christmas-theme',
  },
]

function makeDate(year, month, day) {
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

function getPreferenceKey(event, year) {
  return `plot-twist-event-${event.id}-${year}`
}

function getThemePreference(event, year) {
  try {
    const saved = localStorage.getItem(getPreferenceKey(event, year))

    // Första gången eventet visas är temat på som standard
    return saved === null ? true : saved === 'true'
  } catch {
    return true
  }
}

export function getVisibleEvent(now = new Date()) {
  const currentYear = now.getFullYear()

  // Kontrollera både årets och nästa års event
  for (const year of [currentYear, currentYear + 1]) {
    for (const event of events) {
      const startsAt = makeDate(year, event.startMonth, event.startDay)
      const endsAt = makeDate(year, event.endMonth, event.endDay)

      // Knappen visas från dagen före eventets start
      const countdownStartsAt = new Date(startsAt)
      countdownStartsAt.setDate(countdownStartsAt.getDate() - 1)

      if (now >= countdownStartsAt && now < startsAt) {
        return {
          ...event,
          year,
          phase: 'upcoming',
          startsAt,
          endsAt,
          themeEnabled: false,
        }
      }

      if (now >= startsAt && now < endsAt) {
        return {
          ...event,
          year,
          phase: 'active',
          startsAt,
          endsAt,
          themeEnabled: getThemePreference(event, year),
        }
      }
    }
  }

  // Inget event är aktuellt eller börjar i morgon
  return null
}

export function setEventTheme(event, enabled) {
  if (!event) return

  try {
    localStorage.setItem(
      getPreferenceKey(event, event.year),
      String(enabled)
    )
  } catch {
    // Temat kan fortfarande ändras under den aktuella sessionen
  }
}
