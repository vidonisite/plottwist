
import { useEffect } from 'react'
import { getVisibleEvent } from './eventManager'
import './themes/christmas.css'

export default function EventThemeController() {
  useEffect(() => {
    function updateTheme() {
      const event = getVisibleEvent()

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

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange
    )

    return () => {
      clearInterval(interval)
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      )

      document.body.classList.remove('christmas-theme')
    }
  }, [])

  return null
}
