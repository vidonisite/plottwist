import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ID,
  Query,
  Permission,
  Role,
} from 'appwrite'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

import {
  account,
  tablesDB,
  storage,
  DATABASE_ID,
  USERS_TABLE_ID,
  CONTACTS_TABLE_ID,
  CONVERSATIONS_TABLE_ID,
  CONVERSATION_MEMBERS_TABLE_ID,
  MESSAGES_TABLE_ID,
  TWISTS_BUCKET_ID,
} from './lib/appwrite.js'

import { drawBigEyes } from './filters/bigeyes.jsx'
import { drawFishEye } from './filters/fisheye.jsx'
import { drawAlien } from './filters/alien.jsx'
import { startGlam } from './filters/glam.jsx'
import { startNoLips } from './filters/nolips.jsx'
import { startBigNose } from './filters/bignose.jsx'
import { startSad } from './filters/sad.jsx'
import { drawSquareFace } from './filters/squareface.jsx'
import {
  createTwistReference,
  uploadTwistVideoVersion,
} from './lib/twistMedia.js'
import { encodeVideoAtSpeed } from './lib/videoSpeed.js'
import ProfileAvatar from './components/ProfileAvatar.jsx'
import GroupAvatar from './components/GroupAvatar.jsx'
import { addLatestMessageTimes } from './lib/groupMembers.js'

import './Camera.css'

const FILTERS = [
  { id: 'big-nose', label: 'Big Nose', symbol: '👃' },
  { id: 'sad', label: 'Sad', symbol: '😟' },
  { id: 'none', label: 'No filter', symbol: '📷' },
  { id: 'fisheye', label: 'Fish Eye', symbol: '🐟' },
  { id: 'glam', label: 'Glam Makeup', symbol: '💄' },
  { id: 'nolips', label: 'No Lips', symbol: '💋' },
  { id: 'dreamy', label: 'Dreamy', symbol: '✦' },
  { id: 'alien', label: 'Alien', symbol: '👽' },
]

const SIZE = 640
const DETECTION_INTERVAL = 1000 / 30
const MAX_RECORDING_TIME = 7000
const HOLD_DELAY = 250

function clearCanvas(canvas) {
  if (!canvas) return

  // OpenMakeup använder WebGL och får inte tilldelas en 2D-context.
  if (canvas.classList.contains('makeup-canvas')) return

  const context = canvas.getContext('2d')
  context?.clearRect(0, 0, canvas.width, canvas.height)
}

function drawDreamy(source, context) {
  const { width, height } = source
  const now = performance.now() / 1000

  context.clearRect(0, 0, width, height)

  // En mjuk, färgstark grundton med ett separat glow-lager ger filtret
  // ett tydligare drömmigt uttryck utan att sudda ut ansiktet helt.
  context.save()
  context.filter = 'saturate(1.5) brightness(1.08) contrast(1.03)'
  context.drawImage(source, 0, 0, width, height)
  context.restore()

  context.save()
  context.globalCompositeOperation = 'screen'
  context.globalAlpha = 0.48
  context.filter = 'blur(18px) brightness(1.2)'
  context.drawImage(source, 0, 0, width, height)
  context.restore()

  // Rosa/lila ljusläckage ger en tydlig pastellig ton över bilden.
  context.save()
  context.globalCompositeOperation = 'soft-light'
  const wash = context.createLinearGradient(0, 0, width, height)
  wash.addColorStop(0, 'rgba(255, 183, 218, 0.62)')
  wash.addColorStop(0.48, 'rgba(197, 157, 255, 0.3)')
  wash.addColorStop(1, 'rgba(255, 214, 174, 0.48)')
  context.fillStyle = wash
  context.fillRect(0, 0, width, height)
  context.restore()

  // Lätta, pulserande stjärnglitter – synliga i både foto och video.
  const sparkles = [
    [0.2, 0.22, 0.85],
    [0.78, 0.18, 2.1],
    [0.84, 0.58, 3.2],
    [0.18, 0.76, 4.4],
    [0.63, 0.84, 5.3],
  ]

  context.save()
  context.globalCompositeOperation = 'screen'
  context.fillStyle = 'rgba(255, 255, 255, 0.9)'
  context.shadowColor = 'rgba(255, 220, 255, 0.95)'
  context.shadowBlur = 12

  sparkles.forEach(([x, y, phase]) => {
    const pulse = (Math.sin(now * 2.2 + phase) + 1) / 2
    const radius = 2 + pulse * 2.2
    const centerX = x * width
    const centerY = y * height

    context.globalAlpha = 0.35 + pulse * 0.55
    context.beginPath()
    context.moveTo(centerX, centerY - radius * 2.4)
    context.lineTo(centerX + radius * 0.45, centerY - radius * 0.45)
    context.lineTo(centerX + radius * 2.4, centerY)
    context.lineTo(centerX + radius * 0.45, centerY + radius * 0.45)
    context.lineTo(centerX, centerY + radius * 2.4)
    context.lineTo(centerX - radius * 0.45, centerY + radius * 0.45)
    context.lineTo(centerX - radius * 2.4, centerY)
    context.lineTo(centerX - radius * 0.45, centerY - radius * 0.45)
    context.closePath()
    context.fill()
  })

  context.restore()
}

async function stopAndDisposeMakeup(instance) {
  if (!instance) return

  try {
    await instance.stop()
  } catch (error) {
    console.warn('Kunde inte stoppa makeup-filtret:', error)
  }

  try {
    instance.dispose()
  } catch (error) {
    console.warn('Kunde inte frigöra makeup-filtret:', error)
  }
}

function getVideoMimeType() {
  if (!window.MediaRecorder) return ''

  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]

  return types.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

// Samma stabila ID-metod som används i AddPeople.jsx.
async function stableId(value) {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

export default function Camera({
  currentUser,
  onScore,
  targetConversation = null,
  onClose,
}) {
  const videoRef = useRef(null)
  const captureVideoRef = useRef(null)
  const captureTextEditorRef = useRef(null)
  const canvasRef = useRef(null)
  const makeupCanvasRef = useRef(null)

  const streamRef = useRef(null)
  const landmarkerRef = useRef(null)
  const animationRef = useRef(null)
  const makeupInstanceRef = useRef(null)

  const filterRef = useRef('none')
  const makeupLifecycleRef = useRef(Promise.resolve())
  const makeupStartRef = useRef(false)

  const holdTimerRef = useRef(null)
  const recordingTimerRef = useRef(null)
  const pointerDownRef = useRef(false)
  const recordingStartedRef = useRef(false)
  const pointerClickHandledRef = useRef(false)
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const recordingStreamRef = useRef(null)

  const captureRef = useRef(null)

  const [cameraState, setCameraState] = useState('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [filter, setFilter] = useState('none')
  const [capture, setCapture] = useState(null)
  const [capturePlaybackRate, setCapturePlaybackRate] = useState(1)
  const [captureText, setCaptureText] = useState('')
  const [captureTextPosition, setCaptureTextPosition] = useState(0.5)
  const [showCaptureTextEditor, setShowCaptureTextEditor] = useState(false)
  const [showCaptureSpeedControl, setShowCaptureSpeedControl] = useState(false)

  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [selectedFilterIndex, setSelectedFilterIndex] = useState(0)

  // Skickaflödet
  const [showRecipients, setShowRecipients] = useState(false)
  const [acceptedContacts, setAcceptedContacts] = useState([])
  const [groupConversations, setGroupConversations] = useState([])
  const [selectedRecipientIds, setSelectedRecipientIds] = useState([])
  const [selectedGroupIds, setSelectedGroupIds] = useState([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [sendingTwist, setSendingTwist] = useState(false)
  const [sendMessage, setSendMessage] = useState('')
  const [hasSent, setHasSent] = useState(false)

  const currentUserId = currentUser?.$id

  useEffect(() => {
    filterRef.current = filter
    setSelectedFilterIndex(
      FILTERS.findIndex((item) => item.id === filter)
    )
  }, [filter])

  useEffect(() => {
    captureRef.current = capture
  }, [capture])

  useEffect(() => {
    if (captureVideoRef.current) {
      captureVideoRef.current.playbackRate = capturePlaybackRate
    }
  }, [capture, capturePlaybackRate])

  useEffect(() => {
    if (showCaptureTextEditor) {
      captureTextEditorRef.current?.focus()
    }
  }, [showCaptureTextEditor])

  const stopRecordingTimers = useCallback(() => {
    window.clearTimeout(holdTimerRef.current)
    window.clearTimeout(recordingTimerRef.current)

    holdTimerRef.current = null
    recordingTimerRef.current = null
  }, [])

  const releaseRecordingStream = useCallback(() => {
    recordingStreamRef.current?.getTracks().forEach((track) => {
      track.stop()
    })

    recordingStreamRef.current = null
  }, [])

  const getVisibleCanvas = useCallback(() => {
    return ['glam', 'nolips', 'big-nose'].includes(filterRef.current)
      ? makeupCanvasRef.current
      : canvasRef.current
  }, [])

  const takePhoto = useCallback(() => {
    const sourceCanvas = getVisibleCanvas()

    if (!sourceCanvas) {
      setErrorMessage('Kamerabilden kunde inte hittas. Försök igen.')
      return
    }

    if (!sourceCanvas.width || !sourceCanvas.height) {
      setErrorMessage('Kamerabilden är inte redo ännu. Försök igen.')
      return
    }

    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = sourceCanvas.width
    exportCanvas.height = sourceCanvas.height

    const exportContext = exportCanvas.getContext('2d')

    if (!exportContext) {
      setErrorMessage('Bilden kunde inte bearbetas. Försök igen.')
      return
    }

    try {
      exportContext.drawImage(
        sourceCanvas,
        0,
        0,
        exportCanvas.width,
        exportCanvas.height
      )
    } catch (error) {
      console.error('Kunde inte kopiera kamerabilden:', error)
      setErrorMessage('Bilden kunde inte kopieras. Försök igen.')
      return
    }

    exportCanvas.toBlob(
      (blob) => {
        if (!blob || blob.size === 0) {
          console.error('Bilden blev tom vid export:', {
            sourceWidth: sourceCanvas.width,
            sourceHeight: sourceCanvas.height,
            exportWidth: exportCanvas.width,
            exportHeight: exportCanvas.height,
            activeFilter: filterRef.current,
          })
          setErrorMessage('Bilden blev tom. Försök ta bilden igen.')
          return
        }

        const url = URL.createObjectURL(blob)

        setCapture({
          type: 'photo',
          blob,
          url,
        })

        setCapturePlaybackRate(1)
        setHasSent(false)
        setSendMessage('')
        setShowRecipients(false)
        setCameraState('preview')
      },
      'image/jpeg',
      0.92
    )
  }, [getVisibleCanvas])

  const finishRecording = useCallback(() => {
    stopRecordingTimers()

    const recorder = mediaRecorderRef.current

    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
  }, [stopRecordingTimers])

  const startRecording = useCallback(() => {
    const canvas = getVisibleCanvas()

    if (!canvas) {
      setErrorMessage('Kamerabilden är inte redo ännu.')
      return
    }

    if (!canvas.captureStream || !window.MediaRecorder) {
      setErrorMessage('Videoinspelning stöds inte i den här webbläsaren.')
      return
    }

    try {
      recordedChunksRef.current = []

      const recordingStream = canvas.captureStream(30)
      recordingStreamRef.current = recordingStream

      const mimeType = getVideoMimeType()

      const recorder = new MediaRecorder(
        recordingStream,
        mimeType ? { mimeType } : undefined
      )

      mediaRecorderRef.current = recorder
      const startedAt = Date.now()

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          recordedChunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        setErrorMessage('Videon kunde inte spelas in. Försök igen.')
        setIsRecording(false)
        releaseRecordingStream()
      }

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: recorder.mimeType || 'video/webm',
        })

        releaseRecordingStream()
        mediaRecorderRef.current = null
        setIsRecording(false)
        setRecordingTime(0)

        if (!blob.size) {
          setErrorMessage('Videon blev tom. Försök spela in igen.')
          return
        }

        const url = URL.createObjectURL(blob)

        setCapture({
          type: 'video',
          blob,
          url,
          durationMs: Date.now() - startedAt,
        })

        setCapturePlaybackRate(1)
        setHasSent(false)
        setSendMessage('')
        setShowRecipients(false)
        setCameraState('preview')
      }

      recorder.start()
      setIsRecording(true)
      setRecordingTime(0)

      const updateRecordingTime = () => {
        const elapsed = Math.min(
          Date.now() - startedAt,
          MAX_RECORDING_TIME
        )

        setRecordingTime(elapsed)

        if (
          elapsed < MAX_RECORDING_TIME &&
          recorder.state === 'recording'
        ) {
          recordingTimerRef.current = window.setTimeout(
            updateRecordingTime,
            100
          )
        }
      }

      updateRecordingTime()

      recordingTimerRef.current = window.setTimeout(
        finishRecording,
        MAX_RECORDING_TIME
      )
    } catch (error) {
      console.error('Videoinspelningen kunde inte starta:', error)
      setErrorMessage('Videoinspelningen kunde inte starta.')
      setIsRecording(false)
      releaseRecordingStream()
    }
  }, [
    finishRecording,
    getVisibleCanvas,
    releaseRecordingStream,
  ])

  const handleShutterPointerDown = useCallback(
    (event) => {
      if (cameraState !== 'live' || isRecording) return

      event.preventDefault()

      pointerDownRef.current = true
      recordingStartedRef.current = false

      holdTimerRef.current = window.setTimeout(() => {
        if (!pointerDownRef.current) return

        recordingStartedRef.current = true
        startRecording()
      }, HOLD_DELAY)
    },
    [cameraState, isRecording, startRecording]
  )

  const handleShutterPointerUp = useCallback(() => {
    if (!pointerDownRef.current) return

    pointerDownRef.current = false

    window.clearTimeout(holdTimerRef.current)
    holdTimerRef.current = null

    if (recordingStartedRef.current) {
      finishRecording()
      recordingStartedRef.current = false
    } else {
      takePhoto()
    }
  }, [finishRecording, takePhoto])

  const handleShutterPointerCancel = useCallback(() => {
    pointerDownRef.current = false
    pointerClickHandledRef.current = false
    stopRecordingTimers()

    if (recordingStartedRef.current) {
      finishRecording()
      recordingStartedRef.current = false
    }
  }, [finishRecording, stopRecordingTimers])

  useEffect(() => {
    return () => {
      stopRecordingTimers()

      if (mediaRecorderRef.current?.state !== 'inactive') {
        mediaRecorderRef.current?.stop()
      }

      releaseRecordingStream()

      if (captureRef.current?.url) {
        URL.revokeObjectURL(captureRef.current.url)
      }

      cancelAnimationFrame(animationRef.current)

      const instance = makeupInstanceRef.current
      makeupInstanceRef.current = null

      if (instance) {
        void stopAndDisposeMakeup(instance)
      }

      clearCanvas(canvasRef.current)
      clearCanvas(makeupCanvasRef.current)

      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null

      landmarkerRef.current?.close()
      landmarkerRef.current = null
    }
  }, [releaseRecordingStream, stopRecordingTimers])

  useEffect(() => {
    if (cameraState !== 'live') return

    const video = videoRef.current
    const stream = streamRef.current

    if (!video || !stream) return

    if (video.srcObject !== stream) {
      video.srcObject = stream
    }

    video.play().catch((error) => {
      console.error('Kamerabilden kunde inte återupptas:', error)
    })
  }, [cameraState])

  useEffect(() => {
    if (cameraState !== 'live') return

    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas) return

    canvas.width = SIZE
    canvas.height = SIZE
    clearCanvas(canvas)

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
      if (landmarkerRef.current) return landmarkerRef.current
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
                  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
              },
              runningMode: 'VIDEO',
              numFaces: 1,
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

    function drawFaceFilter(drawFilter) {
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
        drawFilter(sourceCanvas, context, latestFace)
      } else {
        context.clearRect(0, 0, SIZE, SIZE)
        context.drawImage(sourceCanvas, 0, 0, SIZE, SIZE)
      }
    }

    function drawFrame() {
      if (stopped) return

      if (video.readyState < 2) {
        animationRef.current = requestAnimationFrame(drawFrame)
        return
      }

      sourceContext.clearRect(0, 0, SIZE, SIZE)
      sourceContext.save()
      sourceContext.translate(SIZE, 0)
      sourceContext.scale(-1, 1)
      sourceContext.drawImage(video, 0, 0, SIZE, SIZE)
      sourceContext.restore()

      const activeFilter = filterRef.current

      if (activeFilter === 'fisheye') {
        drawFishEye(sourceCanvas, context)
      } else if (activeFilter === 'big-eyes') {
        drawFaceFilter(drawBigEyes)
      } else if (activeFilter === 'square-face') {
        drawFaceFilter(drawSquareFace)
      } else if (activeFilter === 'alien') {
        drawAlien(sourceCanvas, context)
      } else if (activeFilter === 'dreamy') {
        drawDreamy(sourceCanvas, context)
      } else if (activeFilter === 'none') {
        context.clearRect(0, 0, SIZE, SIZE)
        context.drawImage(sourceCanvas, 0, 0, SIZE, SIZE)
      } else if (!['glam', 'nolips', 'big-nose'].includes(activeFilter)) {
        context.clearRect(0, 0, SIZE, SIZE)
        context.drawImage(sourceCanvas, 0, 0, SIZE, SIZE)
      }

      animationRef.current = requestAnimationFrame(drawFrame)
    }

    drawFrame()

    return () => {
      stopped = true
      cancelAnimationFrame(animationRef.current)
      clearCanvas(canvas)
    }
  }, [cameraState, filter])

  // OpenMakeup-filter: Hanterar Glam, No Lips och Big Nose via WebGL-canvasen.
  useEffect(() => {
    if (cameraState !== 'live') {
      const instance = makeupInstanceRef.current
      makeupInstanceRef.current = null
      makeupStartRef.current = false

      if (instance) {
        void stopAndDisposeMakeup(instance)
      }

      clearCanvas(makeupCanvasRef.current)
      clearCanvas(canvasRef.current)
      return
    }

    if (filter !== 'glam' && filter !== 'nolips' && filter !== 'big-nose') {
      const instance = makeupInstanceRef.current
      makeupInstanceRef.current = null
      makeupStartRef.current = false

      if (instance) {
        void stopAndDisposeMakeup(instance)
      }

      clearCanvas(makeupCanvasRef.current)
      return
    }

    const video = videoRef.current
    const canvas = makeupCanvasRef.current

    if (!video || !canvas) return
    if (makeupStartRef.current) return

    canvas.width = SIZE
    canvas.height = SIZE
    clearCanvas(canvas)

    let cancelled = false
    makeupStartRef.current = true

    async function initializeMakeupFilter() {
      try {
        await makeupLifecycleRef.current
        if (cancelled) return

        setErrorMessage('')

        const startFilter = 
          filter === 'nolips' 
            ? startNoLips 
            : filter === 'big-nose' 
              ? startBigNose 
              : startGlam
        
        const instance = await startFilter(video, canvas)

        if (cancelled) {
          await stopAndDisposeMakeup(instance)
          return
        }

        makeupInstanceRef.current = instance
      } catch (error) {
        console.error('OpenMakeup-filtret kunde inte startas:', error)

        if (!cancelled) {
          const details =
            error instanceof Error ? error.message : String(error)

          setErrorMessage(
            `Filter kunde inte laddas: ${details}`
          )
        }
      } finally {
        if (!cancelled) {
          makeupStartRef.current = false
        }
      }
    }

    const startTask = initializeMakeupFilter()

    return () => {
      cancelled = true
      makeupStartRef.current = false

      const cleanupTask = (
        makeupLifecycleRef.current ?? Promise.resolve()
      ).then(async () => {
        await startTask

        const instance = makeupInstanceRef.current

        if (instance) {
          makeupInstanceRef.current = null
          await stopAndDisposeMakeup(instance)
        }

        clearCanvas(makeupCanvasRef.current)
      })

      makeupLifecycleRef.current = cleanupTask.catch((error) => {
        console.error('OpenMakeup cleanup misslyckades:', error)
      })
    }
  }, [cameraState, filter])

  async function startCamera() {
    if (cameraState === 'loading' || cameraState === 'live') return

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
          height: { ideal: 640 },
        },
        audio: false,
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

  async function stopCamera() {
    if (cameraState === 'idle' || cameraState === 'error') return

    stopRecordingTimers()

    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop()
    }

    releaseRecordingStream()

    cancelAnimationFrame(animationRef.current)
    animationRef.current = null

    const instance = makeupInstanceRef.current
    makeupInstanceRef.current = null
    makeupStartRef.current = false

    if (instance) {
      await stopAndDisposeMakeup(instance)
    }

    clearCanvas(canvasRef.current)
    clearCanvas(makeupCanvasRef.current)

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    landmarkerRef.current?.close()
    landmarkerRef.current = null

    setIsRecording(false)
    setCameraState('idle')
  }

  function retakeCapture() {
    if (capture?.url) {
      URL.revokeObjectURL(capture.url)
    }

    setCapture(null)
    setCapturePlaybackRate(1)
    setCaptureText('')
    setCaptureTextPosition(0.5)
    setShowCaptureTextEditor(false)
    setShowCaptureSpeedControl(false)
    setShowRecipients(false)
    setSelectedRecipientIds([])
    setSelectedGroupIds([])
    setSendMessage('')
    setHasSent(false)
    setErrorMessage('')
    setCameraState('live')
  }

  // (Resten av din kod för mottagare och UI behålls intakt nedan...)
  // ...
}
