import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ADVENT_DOOR_COUNT,
  ADVENT_REWARDS,
  addClaimedAdventDoor,
  getClaimedAdventDoors,
  getChristmasCosmetics,
  isAdventDoorUnlocked,
} from './adventCalendar.js'

test('calendar contains 18 doors and five permanent score rewards', () => {
  assert.equal(ADVENT_REWARDS.length, ADVENT_DOOR_COUNT)
  assert.equal(
    ADVENT_REWARDS.filter((reward) => reward.type === 'twist-score').length,
    5
  )
})

test('doors unlock by day and missed doors remain available', () => {
  const december17 = new Date(2026, 11, 17)

  assert.equal(isAdventDoorUnlocked(17, december17), true)
  assert.equal(isAdventDoorUnlocked(18, december17), false)
  assert.equal(isAdventDoorUnlocked(3, december17), true)
  assert.equal(isAdventDoorUnlocked(3, new Date(2026, 10, 30)), false)
})

test('claims are unique per year and preserve other years', () => {
  const profile = {
    christmasCalendarClaims: JSON.stringify({ 2025: [4] }),
  }
  const updatedClaims = addClaimedAdventDoor(profile, 2026, 4)

  assert.deepEqual(getClaimedAdventDoors({
    christmasCalendarClaims: updatedClaims,
  }, 2025), [4])
  assert.deepEqual(getClaimedAdventDoors({
    christmasCalendarClaims: updatedClaims,
  }, 2026), [4])
  assert.throws(() => addClaimedAdventDoor({
    christmasCalendarClaims: updatedClaims,
  }, 2026, 4), /redan öppnad/)
})

test('cosmetics are active only during the event and for the matching year', () => {
  const profile = {
    christmasCalendarClaims: JSON.stringify({ 2026: [4, 7, 12] }),
  }

  assert.deepEqual(
    getChristmasCosmetics(profile, {
      id: 'christmas',
      phase: 'active',
      year: 2026,
    }),
    { santaHat: true, goldFrame: true, hollyName: true }
  )
  assert.deepEqual(
    getChristmasCosmetics(profile, {
      id: 'christmas',
      phase: 'upcoming',
      year: 2026,
    }),
    { santaHat: false, goldFrame: false, hollyName: false }
  )
  assert.deepEqual(
    getChristmasCosmetics(profile, {
      id: 'christmas',
      phase: 'active',
      year: 2027,
    }),
    { santaHat: false, goldFrame: false, hollyName: false }
  )
})
