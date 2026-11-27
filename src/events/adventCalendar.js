export const ADVENT_DOOR_COUNT = 18
export const ADVENT_CLAIMS_FIELD = 'christmasCalendarClaims'

export const ADVENT_REWARDS = [
  { day: 1, type: 'message', text: 'God jul och varmt välkommen!' },
  { day: 2, type: 'twist-score', points: 15 },
  { day: 3, type: 'message', text: 'Dagens lucka skickar lite julglädje!' },
  { day: 4, type: 'santa-hat', text: 'Tomteluva till din avatar!' },
  { day: 5, type: 'message', text: 'Du sprider julstämning!' },
  { day: 6, type: 'twist-score', points: 15 },
  { day: 7, type: 'gold-frame', text: 'En guldram till din avatar!' },
  { day: 8, type: 'message', text: 'En liten julhälsning till dig!' },
  { day: 9, type: 'twist-score', points: 15 },
  { day: 10, type: 'message', text: 'Hoppas du får en riktigt fin dag!' },
  { day: 11, type: 'message', text: 'Lucka 11 önskar dig god jul!' },
  { day: 12, type: 'holly-name', text: 'Ditt namn får julens färger!' },
  { day: 13, type: 'twist-score', points: 15 },
  { day: 14, type: 'message', text: 'Skicka lite julglädje vidare!' },
  {
    day: 15,
    type: 'filter-unlock',
    filterId: 'rainbow-mouth',
    text: 'Du låser upp Regnbåge ur munnen permanent!',
  },
  { day: 16, type: 'message', text: 'En extra dos julmys till dig!' },
  { day: 17, type: 'twist-score', points: 15 },
  { day: 18, type: 'message', text: 'Tack för att du firar med oss!' },
]

function parseClaims(value) {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return {}
    }
  }

  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}
}

export function getClaimedAdventDoors(profile, year) {
  const claims = parseClaims(profile?.[ADVENT_CLAIMS_FIELD])
  const yearClaims = claims[year]

  if (!Array.isArray(yearClaims)) return []

  return yearClaims.filter(
    (day) => Number.isInteger(day) && day >= 1 && day <= ADVENT_DOOR_COUNT
  )
}

export function hasUnlockedAdventFilter(profile, filterId) {
  if (typeof filterId !== 'string' || !filterId) return false

  const claims = parseClaims(profile?.[ADVENT_CLAIMS_FIELD])

  return Object.values(claims).some((yearClaims) =>
    Array.isArray(yearClaims) &&
    yearClaims.some((day) => {
      if (!Number.isInteger(day) || day < 1 || day > ADVENT_DOOR_COUNT) {
        return false
      }

      const reward = ADVENT_REWARDS[day - 1]
      return reward?.type === 'filter-unlock' && reward.filterId === filterId
    })
  )
}

export function addClaimedAdventDoor(profile, year, day) {
  if (!Number.isInteger(day) || day < 1 || day > ADVENT_DOOR_COUNT) {
    throw new Error('Ogiltig kalenderlucka.')
  }

  const claims = parseClaims(profile?.[ADVENT_CLAIMS_FIELD])
  const yearKey = String(year)
  const claimedDays = getClaimedAdventDoors(profile, year)

  if (claimedDays.includes(day)) {
    throw new Error('Den här luckan är redan öppnad.')
  }

  return JSON.stringify({
    ...claims,
    [yearKey]: [...claimedDays, day].sort((a, b) => a - b),
  })
}

export function isAdventDoorUnlocked(day, date) {
  return (
    Number.isInteger(day) &&
    day >= 1 &&
    day <= ADVENT_DOOR_COUNT &&
    date instanceof Date &&
    Number.isFinite(date.getTime()) &&
    date.getMonth() === 11 &&
    date.getDate() >= day
  )
}

export function getChristmasCosmetics(profile, event) {
  const inactive = {
    santaHat: false,
    goldFrame: false,
    hollyName: false,
  }

  if (
    event?.id !== 'christmas' ||
    event.phase !== 'active' ||
    !Number.isInteger(event.year)
  ) {
    return inactive
  }

  return getClaimedAdventDoors(profile, event.year).reduce((cosmetics, day) => {
    const reward = ADVENT_REWARDS[day - 1]

    if (reward?.type === 'santa-hat') cosmetics.santaHat = true
    if (reward?.type === 'gold-frame') cosmetics.goldFrame = true
    if (reward?.type === 'holly-name') cosmetics.hollyName = true

    return cosmetics
  }, inactive)
}
