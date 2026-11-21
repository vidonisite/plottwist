
import './christmas.css'

const TEST_KEY = 'plot-twist-christmas-test'

export function updateChristmasTheme() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 11, 1)
  const end = new Date(now.getFullYear(), 11, 26)

  const testMode = localStorage.getItem(TEST_KEY) === 'true'
  const isChristmasTime = now >= start && now < end

  document.body.classList.toggle(
    'christmas-theme',
    testMode || isChristmasTime
  )
}

export function toggleChristmasTest() {
  const enabled = localStorage.getItem(TEST_KEY) !== 'true'

  localStorage.setItem(TEST_KEY, String(enabled))
  updateChristmasTheme()

  return enabled
}
