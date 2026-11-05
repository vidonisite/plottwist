const SUPPORTED_RATES = [0.5, 1, 2]

export function encodeVideoAtSpeed(sourceBlob, playbackRate) {
  if (!SUPPORTED_RATES.includes(playbackRate)) {
    return Promise.reject(new Error('Ogiltig videohastighet.'))
  }

  if (playbackRate === 1) {
    return Promise.resolve(sourceBlob)
  }

  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    return Promise.reject(
      new Error('Videobearbetning stöds inte i den här webbläsaren.')
    )
  }

  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(sourceBlob)
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    let stream = null
    let recorder = null
    let animationId = null
    let failure = null
    const chunks = []

    video.muted = true
    video.playsInline = true
    video.preload = 'auto'

    function cleanup() {
      if (animationId !== null) {
        cancelAnimationFrame(animationId)
      }

      video.pause()
      video.removeAttribute('src')
      video.load()
      stream?.getTracks().forEach((track) => track.stop())
      URL.revokeObjectURL(sourceUrl)
    }

    function fail(error) {
      failure = error

      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
      } else {
        cleanup()
        reject(error)
      }
    }

    function drawFrame() {
      if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
      }

      if (!video.ended && !video.paused) {
        animationId = requestAnimationFrame(drawFrame)
      }
    }

    video.onerror = () => fail(new Error('Videon kunde inte läsas.'))

    video.oncanplay = () => {
      video.oncanplay = null
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      try {
        stream = canvas.captureStream(30)
        const mimeType = [
          'video/webm;codecs=vp9',
          'video/webm;codecs=vp8',
          'video/webm',
        ].find((type) => MediaRecorder.isTypeSupported(type))

        recorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined
        )
      } catch (error) {
        fail(error)
        return
      }

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data)
      }

      recorder.onerror = (event) => {
        fail(event.error || new Error('Videon kunde inte kodas om.'))
      }

      recorder.onstop = () => {
        const blob = new Blob(chunks, {
          type: recorder.mimeType || 'video/webm',
        })

        cleanup()

        if (failure) {
          reject(failure)
        } else if (blob.size) {
          resolve(blob)
        } else {
          reject(new Error('Videon blev tom vid bearbetning.'))
        }
      }

      video.playbackRate = playbackRate
      try {
        recorder.start()
        video.play()
          .then(drawFrame)
          .catch(fail)
      } catch (error) {
        fail(error)
      }
    }

    video.onended = () => {
      if (recorder?.state === 'recording') recorder.stop()
    }

    video.src = sourceUrl
    video.load()
  })
}