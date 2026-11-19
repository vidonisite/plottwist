const BRIDGE_KEY = '__PLOT_TWIST_MINDAR_BRIDGE__'
const INSTANCE_KEY = '__PLOT_TWIST_MINDAR_INSTANCE__'

/**
 * Starts the original MindAR Studio export in a hidden iframe.
 * The export's own MindARThree.outputCanvas is returned to Camera.jsx,
 * where it is copied into the same canvas used for photos and recordings.
 */
export function startMindAR({ host, stream, mirror = true, signal }) {
  if (!host) {
    return Promise.reject(new Error('MindAR-behållaren saknas.'))
  }

  if (!stream?.active || typeof stream.clone !== 'function') {
    return Promise.reject(new Error('PLOT TWIST-kamerans stream är inte aktiv.'))
  }

  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    const bridge = {
      getStream: () => stream,
      mirror,
    }

    let pollId = null
    let timeoutId = null
    let settled = false
    let stopped = false

    frame.title = 'MindAR 3D filter'
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('tabindex', '-1')
    frame.setAttribute('allow', 'camera; fullscreen')
    frame.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      'width:640px',
      'height:640px',
      'border:0',
      'visibility:hidden',
      'pointer-events:none',
    ].join(';')

    const removeBridge = () => {
      if (window[BRIDGE_KEY] === bridge) {
        delete window[BRIDGE_KEY]
      }
    }

    const stop = async () => {
      if (stopped) return
      stopped = true
      window.clearInterval(pollId)
      window.clearTimeout(timeoutId)
      signal?.removeEventListener('abort', onAbort)

      try {
        const frameWindow = frame.contentWindow
        const instance = frameWindow?.[INSTANCE_KEY]

        // MindAR.stop() stops only the cloned tracks supplied by the bridge.
        try {
          instance?.stop()
        } catch (error) {
          console.warn('MindAR kunde inte stoppas normalt:', error)
        }

        // Fallback for a failure during startup, before MindAR exposes a usable instance.
        try {
          const videos = frame.contentDocument?.querySelectorAll('video') || []
          videos.forEach((video) => {
            video.srcObject?.getTracks?.().forEach((track) => track.stop())
            video.pause?.()
            video.srcObject = null
          })
        } catch (error) {
          console.warn('MindAR-videon kunde inte städas:', error)
        }

        try {
          instance?.renderer?.setAnimationLoop?.(null)
          instance?.renderer?.dispose?.()
          instance?.renderer?.forceContextLoss?.()
          instance?.cssRenderer?.dispose?.()
          instance?.outputCanvas?.remove?.()
          instance?.renderer?.domElement?.remove?.()
          if (frameWindow) frameWindow[INSTANCE_KEY] = null
        } catch (error) {
          console.warn('MindAR-resurser kunde inte frigöras helt:', error)
        }
      } finally {
        frame.remove()
        removeBridge()
      }
    }

    const fail = async (error) => {
      if (settled) return
      settled = true
      await stop()
      reject(error instanceof Error ? error : new Error(String(error)))
    }

    const onAbort = () => {
      void fail(new DOMException('MindAR-starten avbröts.', 'AbortError'))
    }

    const checkReady = () => {
      if (stopped || settled) return

      try {
        const frameWindow = frame.contentWindow
        const instance = frameWindow?.[INSTANCE_KEY]
        const outputCanvas = instance?.outputCanvas
        const video = instance?.video

        if (
          outputCanvas &&
          outputCanvas.width > 0 &&
          outputCanvas.height > 0 &&
          video &&
          video.readyState >= 2
        ) {
          settled = true
          window.clearInterval(pollId)
          window.clearTimeout(timeoutId)
          signal?.removeEventListener('abort', onAbort)
          resolve({
            outputCanvas,
            frame,
            stop,
          })
        }
      } catch (error) {
        void fail(new Error(`MindAR kunde inte starta: ${error.message || error}`))
      }
    }

    if (signal?.aborted) {
      void fail(new DOMException('MindAR-starten avbröts.', 'AbortError'))
      return
    }

    window[BRIDGE_KEY] = bridge
    signal?.addEventListener('abort', onAbort, { once: true })

    frame.addEventListener('load', () => {
      pollId = window.setInterval(checkReady, 50)
      checkReady()
    }, { once: true })

    frame.addEventListener('error', () => {
      void fail(new Error('MindAR-exporten kunde inte laddas.'))
    }, { once: true })

    timeoutId = window.setTimeout(() => {
      void fail(new Error('MindAR tog för lång tid att starta. Kontrollera att filerna i public/mindar finns kvar.'))
    }, 30000)

    host.appendChild(frame)
    frame.src = '/mindar/index.html?embedded=1'
  })
}
