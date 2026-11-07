import { clientsClaim } from 'workbox-core'
import { precacheAndRoute } from 'workbox-precaching'

self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('push', (event) => {
  let data = {}

  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { body: event.data?.text() }
  }

  event.waitUntil((async () => {
    if (data.type === 'incoming-call' && data.conversationId) {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      const callAlreadyVisible = windowClients.some((client) => {
        if (client.visibilityState !== 'visible') return false
        try {
          return new URL(client.url).searchParams.get('conversationId') ===
            data.conversationId
        } catch {
          return false
        }
      })

      if (callAlreadyVisible) return
    }

    await self.registration.showNotification(data.title || 'PLOT TWIST', {
      body: data.body || 'Du har fått ett nytt meddelande.',
      icon: '/icons/plot-twist-192.png',
      badge: '/icons/plot-twist-192.png',
      data: { url: data.url || '/' },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const target = new URL(event.notification.data?.url || '/', self.location.origin)
  if (target.origin !== self.location.origin) return

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(
      (windowClients) => {
        const existingClient = windowClients.find(
          (client) => new URL(client.url).origin === self.location.origin
        )

        if (existingClient) {
          if (target.searchParams.has('conversationId')) {
            return existingClient.navigate(target.href).then(() => existingClient.focus())
          }
          return existingClient.focus()
        }

        return self.clients.openWindow(target.href)
      }
    )
  )
})
