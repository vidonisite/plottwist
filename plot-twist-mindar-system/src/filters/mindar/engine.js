const BRIDGE_KEY = '__PLOT_TWIST_MINDAR_BRIDGE__'
const INSTANCE_KEY = '__PLOT_TWIST_MINDAR_INSTANCE__'
const PRIVACY_ERROR_KEY = '__PLOT_TWIST_MINDAR_PRIVACY_ERROR__'

function createVideoOnlyClone(stream) {
  if (!stream?.active || typeof stream.getVideoTracks !== 'function') {
    throw new Error('PLOT TWISTs kamerastream är inte aktiv.')
  }

  const tracks = stream.getVideoTracks()
  if (!tracks.length) throw new Error('Kamerastreamen saknar videospår.')

  const clonedTracks = tracks.map((track) => track.clone())
  const clone = new MediaStream(clonedTracks)

  if (!clone.active || clone.getAudioTracks().length) {
    clone.getTracks().forEach((track) => track.stop())
    throw new Error('MindAR fick inte en ren videokopia.')
  }

  return clone
}

/** Starts the shared MindAR Studio runtime with one allow-listed scene asset. */
export function startMindAR({
  host,
  stream,
  mirror = true,
  signal,
  filterId = 'default',
}) {
  if (!host) return Promise.reject(new Error('MindAR-behållaren saknas.'))
  if (!/^[a-z0-9-]{1,40}$/.test(filterId)) {
    return Promise.reject(new Error('Ogiltigt MindAR-filter-ID.'))
  }
  if (!stream?.active || typeof stream.getVideoTracks !== 'function') {
    return Promise.reject(new Error('PLOT TWIST-kamerans stream är inte aktiv.'))
  }

  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    const clonedStreams = new Set()
    let pollId = null
    let timeoutId = null
    let settled = false
    let stopped = false

    const bridge = {
      mirror: Boolean(mirror),
      cloneVideoStream: () => {
        if (stopped) throw new Error('MindAR-sessionen är redan stängd.')
        const clone = createVideoOnlyClone(stream)
        clonedStreams.add(clone)
        return clone
      },
    }

    frame.title = 'PLOT TWIST 3D-filter'
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('tabindex', '-1')
    frame.setAttribute('allow', "camera 'none'; microphone 'none'")
    frame.referrerPolicy = 'no-referrer'
    frame.style.cssText = [
      'position:absolute', 'left:0', 'top:0', 'width:640px', 'height:640px',
      'border:0', 'visibility:hidden', 'pointer-events:none',
    ].join(';')

    const removeBridge = () => {
      if (window[BRIDGE_KEY] === bridge) delete window[BRIDGE_KEY]
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
        try { instance?.stop?.() } catch (error) {
          console.warn('MindAR kunde inte stoppas normalt:', error)
        }

        try {
          const videos = frame.contentDocument?.querySelectorAll('video') || []
          videos.forEach((video) => {
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
        clonedStreams.forEach((cloned) => {
          cloned.getTracks().forEach((track) => track.stop())
        })
        clonedStreams.clear()
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
        const privacyError = frameWindow?.[PRIVACY_ERROR_KEY]
        if (privacyError) {
          void fail(new Error(`MindAR:s sekretesskydd kunde inte aktiveras: ${privacyError}`))
          return
        }
        const instance = frameWindow?.[INSTANCE_KEY]
        const outputCanvas = instance?.outputCanvas
        const video = instance?.video

        if (outputCanvas?.width > 0 && outputCanvas?.height > 0 && video?.readyState >= 2) {
          settled = true
          window.clearInterval(pollId)
          window.clearTimeout(timeoutId)
          signal?.removeEventListener('abort', onAbort)
          resolve({ outputCanvas, frame, stop })
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
      void fail(new Error('MindAR-motorn kunde inte laddas.'))
    }, { once: true })

    timeoutId = window.setTimeout(() => {
      void fail(new Error('MindAR tog för lång tid att starta. Kontrollera engine- och filterfilerna.'))
    }, 30000)

    host.appendChild(frame)
    frame.src = `/mindar/engine/index.html?embedded=1&filter=${encodeURIComponent(filterId)}`
  })
}
