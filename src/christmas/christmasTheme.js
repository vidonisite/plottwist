
import './christmas.css'

export function updateChristmasTheme() {
  const now = new Date()
  const year = now.getFullYear()

  const start = new Date(year, 11, 1)
  const end = new Date(year, 11, 26)

  const isChristmasTime = now >= start && now < end

  document.body.classList.toggle(
    'christmas-theme',
    isChristmasTime
  )
}
