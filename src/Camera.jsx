import { useEffect, useRef, useState } from 'react'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

import { drawBigEyes } from './filters/bigeyes.jsx'
import { drawFishEye } from './filters/fisheye.jsx'
import { drawAlien } from './filters/alien.jsx'
import { startGlam } from './filters/glam.jsx'

import './Camera.css'

const FILTERS = [
  { id: 'big-eyes', label: 'Big eyes', symbol: '◉' },
  { id: 'fisheye', label: 'Fish Eye', symbol: '🐟' },
  { id: 'dreamy', label: 'Dreamy', symbol: '✦' },
  { id: 'mono', label: 'No filter', symbol: '◐' },
  { id: 'alien', label: 'Alien', symbol: '👽' },
  { id: 'glam', label: 'Glam Makeup', symbol: '💄' },
]

const SIZE = 320
const DETECTION_INTERVAL = 1000 / 30

export default function Camera() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const glamCanvasRef = useRef(null)

  const streamRef = useRef(null)
  const landmarkerRef = useRef(null)
  const animationRef = useRef(null)
  const glamInstanceRef = useRef(null)

  const filterRef = useRef('big-eyes')

  const [cameraState, setCameraState] = useState('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [filter, setFilter] = useState('big-eyes')

  useEffect(() => {
    filterRef.current = filter
  }, [filter])

  // Stäng allt när komponenten försvinner.
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animationRef.current)

      glamInstanceRef.current?.dispose()
      glamInstanceRef.current = null

      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null

      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [])

  // Den vanliga 2D-renderingen för dina andra filter.
  useEffect(() => {
    if (cameraState !== 'live') return

    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas) return

    canvas.width = SIZE
    canvas.height = SIZE

    const context = canvas.getContext('2d')

    if (!context) return

    const sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = SIZE
    sourceCanvas.height = SIZE

    const sourceContext = sourceCanvas.getContext('2d')

    if (!sourceContext) return

    let lastDetectionTime = 0
    let latestFace = null
    let stopped = false
    let landmarkerPromise = null
    let landmarkerFailed = false

    async function getLandmarker() {
      if (landmarkerRef.current) {
        return landmarkerRef.current
      }

      if (landmarkerFailed) return null

      if (!landmarkerPromise) {
        landmarkerPromise = (async () => {
          const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
          )

          const landmarker = await FaceLandmarker.createFromOptions(
            vision,
            {
              baseOptions: {
                modelAssetPath:
                  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
              },
              runningMode: 'VIDEO',
              numFaces: 1
            }
          )

          if (stopped) {
            landmarker.close()
            return null
          }

          landmarkerRef.current = landmarker
          return landmarker
        })().catch((error) => {
          console.error('Kunde inte ladda ansiktsigenkänning:', error)
          landmarkerFailed = true
          return null
        })
      }

      return landmarkerPromise
    }

    function drawFrame() {
      if (stopped) return

      if (video.readyState < 2) {
        animationRef.current = requestAnimationFrame(drawFrame)
        return
      }

      sourceContext.drawImage(video, 0, 0, SIZE, SIZE)

      const activeFilter = filterRef.current

      if (activeFilter === 'fisheye') {
        drawFishEye(sourceCanvas, context)
      } else if (activeFilter === 'big-eyes') {
        const now = performance.now()

        if (now - lastDetectionTime >= DETECTION_INTERVAL) {
          lastDetectionTime = now

          getLandmarker().then((landmarker) => {
            if (stopped || !landmarker) return

            try {
              const result = landmarker.detectForVideo(
                video,
                performance.now()
              )

              latestFace = result.faceLandmarks?.[0] ?? null
            } catch (error) {
              console.error('Ansiktsigenkänning misslyckades:', error)
              latestFace = null
            }
          })
        }

        if (latestFace) {
          drawBigEyes(sourceCanvas, context, latestFace)
        } else {
          context.drawImage(sourceCanvas, 0, 0, SIZE, SIZE)
        }
      } else if (activeFilter === 'alien') {
        drawAlien(sourceCanvas, context)
      } else {
        context.drawImage(sourceCanvas, 0, 0, SIZE, SIZE)
      }

      animationRef.current = requestAnimationFrame(drawFrame)
    }

    drawFrame()

    return () => {
      stopped = true
      cancelAnimationFrame(animationRef.current)
    }
  }, [cameraState])

  // OpenMakeup får en egen WebGL-canvas.
  // Den återanvänder kamerans redan öppnade videoström.
  useEffect(() => {
    if (cameraState !== 'live' || filter !== 'glam') {
      glamInstanceRef.current?.dispose()
      glamInstanceRef.current = null
      return
    }

    const video = videoRef.current
    const canvas = glamCanvasRef.current

    if (!video || !canvas) return

    let cancelled = false

    async function initializeGlam() {
      try {
        setErrorMessage('')

        const instance = await startGlam(video, canvas)

        if (cancelled) {
          instance.dispose()
          return
        }

        glamInstanceRef.current = instance
      } catch (error) {
        console.error('Glam kunde inte startas:', error)

        if (!cancelled) {
          setErrorMessage(
            'Glam Makeup kunde inte laddas. Kontrollera internetanslutningen och försök igen.'
          )
        }
      }
    }

    initializeGlam()

    return () => {
      cancelled = true

      glamInstanceRef.current?.dispose()
      glamInstanceRef.current = null
    }
  }, [cameraState, filter])

  async function startCamera() {
    setErrorMessage('')
    setCameraState('loading')

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Kameran stöds inte här. Öppna appen via en säker HTTPS-adress.'
        )
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 640 }
        },
        audio: false
      })

      streamRef.current = stream

      const video = videoRef.current

      if (!video) {
        throw new Error('Kamerafönstret kunde inte hittas.')
      }

      video.srcObject = stream
      await video.play()

      setCameraState('live')
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null

      if (videoRef.current) {
        videoRef.current.srcObject = null
      }

      landmarkerRef.current?.close()
      landmarkerRef.current = null

      console.error('Kameran kunde inte startas:', error)

      setErrorMessage(
        error?.message?.includes('HTTPS')
          ? error.message
          : 'Vi kunde inte starta kameran. Kontrollera kameratillståndet och försök igen.'
      )

      setCameraState('error')
    }
  }

  function stopCamera() {
    cancelAnimationFrame(animationRef.current)
    animationRef.current = null

    glamInstanceRef.current?.dispose()
    glamInstanceRef.current = null

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    landmarkerRef.current?.close()
    landmarkerRef.current = null

    setCameraState('idle')
  }

  return (
    <section className="page camera-page">
      <div className={`camera-frame filter-${filter}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="camera-source-video"
        />

        {cameraState === 'live' ? (
          <>
            <canvas
              ref={canvasRef}
              className="camera-canvas"
              style={{
                display: filter === 'glam' ? 'none' : 'block'
              }}
            />

            <canvas
              ref={glamCanvasRef}
              className="camera-canvas glam-canvas"
              style={{
                display: filter === 'glam' ? 'block' : 'none'
              }}
            />

            <span className="live-label">
              <span />
              LIVE
            </span>
          </>
        ) : (
          <button
            className="camera-start-area"
            onClick={startCamera}
            disabled={cameraState === 'loading'}
            aria-label="Öppna kameran och skicka Twists"
          >
            <span className="camera-start-circle">
              {cameraState === 'loading' ? '…' : '📷'}
            </span>

            <span className="camera-start-text">
              {cameraState === 'loading'
                ? 'Startar kameran…'
                : 'Klicka på kameran för att skicka Twists'}
            </span>
          </button>
        )}

        <span className="camera-corner corner-tl" />
        <span className="camera-corner corner-tr" />
        <span className="camera-corner corner-bl" />
        <span className="camera-corner corner-br" />
      </div>

      <div className="filter-picker">
        <div className="filter-options">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              className={`filter-chip ${
                filter === item.id ? 'selected' : ''
              }`}
              onClick={() => setFilter(item.id)}
              aria-pressed={filter === item.id}
            >
              <span>{item.symbol}</span>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {errorMessage && (
        <p className="camera-error" role="alert">
          {errorMessage}
        </p>
      )}

      {cameraState === 'live' && (
        <button className="primary-button" onClick={stopCamera}>
          Stäng kameran
        </button>
      )}
    </section>
  )
}
