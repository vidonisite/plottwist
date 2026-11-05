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
import { drawSquareFace } from './filters/squareface.jsx'

import './Camera.css'

const FILTERS = [
  { id: 'none', label: 'No filter', symbol: '' },
  { id: 'fisheye', label: 'Fish Eye', symbol: '🐟' },
  { id: 'glam', label: 'Glam Makeup', symbol: '💄' },
  { id: 'nolips', label: 'No Lips', symbol: '💋' },
  { id: 'dreamy', label: 'Dreamy', symbol: '✦' },
  { id: 'square-face', label: 'Square Face', symbol: '▣' },
  { id: 'alien', label: 'Alien', symbol: '👽' },
  { id: 'big-eyes', label: 'Big eyes', symbol: '◉' },
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

export default function Camera({ currentUser }) {
  const videoRef = useRef(null)
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
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])
  const recordingStreamRef = useRef(null)

  const captureRef = useRef(null)

  const [cameraState, setCameraState] = useState('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [filter, setFilter] = useState('none')
  const [capture, setCapture] = useState(null)

  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [selectedFilterIndex, setSelectedFilterIndex] = useState(0)

  // Skickaflödet
  const [showRecipients, setShowRecipients] = useState(false)
  const [acceptedContacts, setAcceptedContacts] = useState([])
  const [selectedRecipientIds, setSelectedRecipientIds] = useState([])
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
    return ['glam', 'nolips'].includes(filterRef.current)
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

    // Kopiera den synliga kamerabilden till en separat 2D-canvas.
    // Det gör exporten oberoende av kamerans vanliga canvas och WebGL-canvasen.
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

        console.log('FOTO SKAPAT:', blob.size, blob.type)

        const url = URL.createObjectURL(blob)

        setCapture({
          type: 'photo',
          blob,
          url,
        })

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
        })

        setHasSent(false)
        setSendMessage('')
        setShowRecipients(false)
        setCameraState('preview')
      }

      recorder.start()
      setIsRecording(true)
      setRecordingTime(0)

      const startedAt = Date.now()

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
    stopRecordingTimers()

    if (recordingStartedRef.current) {
      finishRecording()
      recordingStartedRef.current = false
    }
  }, [finishRecording, stopRecordingTimers])

  // Städa bara när komponenten avmonteras.
  // captureRef gör att ett nytt foto inte råkar stoppa kameran.
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

  // Kamerans bild och filter.
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
      } else if (!['glam', 'nolips'].includes(activeFilter)) {
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

  // OpenMakeup-filter: Glam och No Lips delar en WebGL-canvas och körs aldrig samtidigt.
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

    if (filter !== 'glam' && filter !== 'nolips') {
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

    async function initializeGlam() {
      try {
        await makeupLifecycleRef.current
        if (cancelled) return

        setErrorMessage('')

        const startFilter = filter === 'nolips' ? startNoLips : startGlam
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
            `${filter === 'nolips' ? 'No Lips' : 'Glam Makeup'} kunde inte laddas: ${details}`
          )
        }
      } finally {
        if (!cancelled) {
          makeupStartRef.current = false
        }
      }
    }

    const startTask = initializeGlam()

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
    setShowRecipients(false)
    setSelectedRecipientIds([])
    setSendMessage('')
    setHasSent(false)
    setErrorMessage('')
    setCameraState('live')
  }

  // Hämta bara accepterade kontakter när mottagarvyn öppnas.
  async function openRecipients() {
    console.log('SEND-KNAPPEN KLICKAD')

    if (!currentUserId || !capture || hasSent) {
      console.log('Avbruten:', {
        currentUserId,
        captureExists: !!capture,
        hasSent,
      })
      return
    }
    if (!currentUserId || !capture || hasSent) return

    setShowRecipients(true)
    setLoadingContacts(true)
    setErrorMessage('')
    setSendMessage('')
    setSelectedRecipientIds([])

    try {
      const response = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: CONTACTS_TABLE_ID,
        queries: [
          Query.equal('ownerId', [currentUserId]),
          Query.equal('status', ['accepted']),
          Query.limit(500),
        ],
      })

      setAcceptedContacts(response.rows)
    } catch (error) {
      console.error('Kunde inte hämta kontakter:', error)

      setErrorMessage(
        `Kunde inte hämta dina kontakter: ${error.message || 'Okänt fel'}`
      )
    } finally {
      setLoadingContacts(false)
    }
  }

  function toggleRecipient(userId) {
    setSelectedRecipientIds((previous) => {
      if (previous.includes(userId)) {
        return previous.filter((id) => id !== userId)
      }

      return [...previous, userId]
    })
  }

  // Skapar eller återanvänder exakt samma direktchatt som AddPeople.jsx.
  async function ensureDirectConversation(userAId, userBId) {
    if (!userAId || !userBId || userAId === userBId) {
      throw new Error('Ogiltiga användare för chatten.')
    }

    const directKey = [userAId, userBId].sort().join(':')
    const conversationId = await stableId(`direct:${directKey}`)

    let conversation

    try {
      conversation = await tablesDB.getRow({
        databaseId: DATABASE_ID,
        tableId: CONVERSATIONS_TABLE_ID,
        rowId: conversationId,
      })

      if (conversation.directKey !== directKey) {
        throw new Error(
          'Chattens ID matchar inte användarna.'
        )
      }
    } catch (error) {
      if (error.message?.includes('matchar inte användarna')) {
        throw error
      }

      if (error.code !== 404) {
        throw error
      }

      try {
        conversation = await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: CONVERSATIONS_TABLE_ID,
          rowId: conversationId,
          data: {
            type: 'direct',
            name: 'Privat chatt',
            createdBy: userAId,
            directKey,
          },
          permissions: [
            Permission.read(Role.users()),
            Permission.update(Role.users()),
            Permission.delete(Role.users()),
          ],
        })
      } catch (createError) {
        try {
          conversation = await tablesDB.getRow({
            databaseId: DATABASE_ID,
            tableId: CONVERSATIONS_TABLE_ID,
            rowId: conversationId,
          })
        } catch {
          throw createError
        }
      }
    }

    for (const userId of [userAId, userBId]) {
      const memberId = await stableId(
        `member:${conversation.$id}:${userId}`
      )

      try {
        await tablesDB.getRow({
          databaseId: DATABASE_ID,
          tableId: CONVERSATION_MEMBERS_TABLE_ID,
          rowId: memberId,
        })
      } catch (error) {
        if (error.code !== 404) {
          throw error
        }

        try {
          await tablesDB.createRow({
            databaseId: DATABASE_ID,
            tableId: CONVERSATION_MEMBERS_TABLE_ID,
            rowId: memberId,
            data: {
              userId,
              conversationId: conversation.$id,
            },
            permissions: [
              // Alla inloggade kan läsa medlemslistan, men varje användare
              // får bara uppdatera sin egen medlemsrad (t.ex. lastReadAt).
              Permission.read(Role.users()),
              Permission.update(Role.user(userId)),
            ],
          })
        } catch (createError) {
          try {
            await tablesDB.getRow({
              databaseId: DATABASE_ID,
              tableId: CONVERSATION_MEMBERS_TABLE_ID,
              rowId: memberId,
            })
          } catch {
            throw createError
          }
        }
      }
    }

    return conversation
  }

  async function sendTwist() {
    if (
      !capture ||
      !currentUserId ||
      selectedRecipientIds.length === 0 ||
      sendingTwist
    ) {
      return
    }

    setSendingTwist(true)
    setErrorMessage('')
    setSendMessage('')

    let uploadedFileId = null
    let sentCount = 0

    try {
      // 1. Ladda upp filen EN gång.
      uploadedFileId = ID.unique()

      console.log('CAPTURE:', capture)
      console.log('BLOB SIZE:', capture?.blob?.size)
      console.log('BLOB TYPE:', capture?.blob?.type)

      if (!capture.blob || capture.blob.size === 0) {
        throw new Error('Filen är tom. Ta en ny bild eller spela in en ny video.')
      }

      const uploadFile = new File(
        [capture.blob],
        capture.type === 'video' ? 'twist.webm' : 'twist.jpg',
        {
          type: capture.blob.type || (
            capture.type === 'video' ? 'video/webm' : 'image/jpeg'
          ),
        }
      )

      if (uploadFile.size === 0) {
        throw new Error('Filen blev tom när den förbereddes för uppladdning.')
      }

      await storage.createFile({
        bucketId: TWISTS_BUCKET_ID,
        fileId: uploadedFileId,
        file: uploadFile,
        permissions: [
          Permission.read(Role.users()),
          Permission.update(Role.user(currentUserId)),
          Permission.delete(Role.user(currentUserId)),
        ],
      })

      // 2. Skapa ett Twist-meddelande i varje vald persons chatt.
      for (const recipientId of selectedRecipientIds) {
        const conversation = await ensureDirectConversation(
          currentUserId,
          recipientId
        )

        await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: MESSAGES_TABLE_ID,
          rowId: ID.unique(),
          data: {
            conversationId: conversation.$id,
            senderId: currentUserId,
            text: uploadedFileId,
            type: 'twist',
          },
          permissions: [
            Permission.read(Role.users()),
            Permission.update(Role.user(currentUserId)),
            Permission.delete(Role.user(currentUserId)),
          ],
        })

        sentCount += 1
      }

      retakeCapture()
    } catch (error) {
      console.error('Kunde inte skicka Twist:', error)

      if (sentCount > 0) {
        setErrorMessage(
          `Twist skickades till ${sentCount} av ${selectedRecipientIds.length} personer. Ett fel uppstod: ${error.message || 'Okänt fel'}`
        )
      } else {
        setErrorMessage(
          `Twist kunde inte skickas: ${error.message || 'Okänt fel'}`
        )
      }
    } finally {
      setSendingTwist(false)
    }
  }

  function selectFilter(item) {
    if (isRecording || cameraState !== 'live') return

    setFilter(item.id)
    setErrorMessage('')
  }

  const recordingProgress = Math.min(
    (recordingTime / MAX_RECORDING_TIME) * 100,
    100
  )

  return (
    <section className="page camera-page">
      <div className="camera-content">

        {/* FÖRHANDSVISNING */}
        {cameraState === 'preview' && capture && (
          <div className="capture-preview">

            {capture.type === 'photo' ? (
              <img src={capture.url} alt="Din tagna bild" />
            ) : (
              <video
                src={capture.url}
                controls
                autoPlay
                playsInline
                loop
              />
            )}

            {!showRecipients ? (
              <>
                <div className="capture-preview-actions">
                  <button
                    className="capture-secondary-button"
                    onClick={retakeCapture}
                    disabled={sendingTwist}
                  >
                    Retake
                  </button>

                  <button
                    className="capture-send-button"
                    onClick={openRecipients}
                    disabled={hasSent || sendingTwist}
                  >
                    {hasSent ? 'Sent ✓' : 'Send'}
                  </button>
                </div>

                {sendMessage && (
                  <p className="camera-send-message" role="status">
                    {sendMessage}
                  </p>
                )}
              </>
            ) : (
              <div
                className="twist-recipient-panel"
                style={{
                  width: '100%',
                  maxWidth: '480px',
                  margin: '18px auto 0',
                  padding: '22px',
                  borderRadius: '22px',
                  background: '#fff',
                  color: '#320E3B',
                  boxSizing: 'border-box',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '16px',
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0 }}>Send to...</h2>
                    <p style={{ margin: '5px 0 0', opacity: 0.65 }}>
                      Choose who gets your Twist.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowRecipients(false)}
                    disabled={sendingTwist}
                    aria-label="Tillbaka"
                    style={{
                      border: 0,
                      borderRadius: '50%',
                      width: '38px',
                      height: '38px',
                      cursor: 'pointer',
                      background: '#F3EAF5',
                      color: '#320E3B',
                      fontSize: '22px',
                    }}
                  >
                    ×
                  </button>
                </div>

                {loadingContacts ? (
                  <p>Laddar dina kontakter...</p>
                ) : acceptedContacts.length === 0 ? (
                  <p>
                    Du har inga accepterade kontakter ännu.
                    Lägg till personer innan du skickar ett Twist.
                  </p>
                ) : (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        maxHeight: '260px',
                        overflowY: 'auto',
                      }}
                    >
                      {acceptedContacts.map((contact) => {
                        const selected = selectedRecipientIds.includes(
                          contact.contactUserId
                        )

                        const username =
                          contact.contactUsername || 'Okänd användare'

                        return (
                          <label
                            key={contact.$id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              padding: '12px',
                              borderRadius: '14px',
                              background: selected ? '#F3EAF5' : '#FAF7FB',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() =>
                                toggleRecipient(contact.contactUserId)
                              }
                              disabled={sendingTwist}
                              style={{
                                width: '18px',
                                height: '18px',
                                accentColor: '#8C52FF',
                              }}
                            />

                            <span
                              style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '50%',
                                display: 'grid',
                                placeItems: 'center',
                                background: '#EADCF4',
                                fontWeight: 700,
                              }}
                            >
                              {username.slice(0, 1).toUpperCase()}
                            </span>

                            <strong>@{username}</strong>
                          </label>
                        )
                      })}
                    </div>

                    <p
                      style={{
                        margin: '14px 0',
                        fontSize: '13px',
                        opacity: 0.65,
                      }}
                    >
                      {selectedRecipientIds.length} valda
                    </p>

                    <button
                      type="button"
                      className="capture-send-button"
                      onClick={sendTwist}
                      disabled={
                        selectedRecipientIds.length === 0 ||
                        sendingTwist
                      }
                      style={{
                        width: '100%',
                        opacity:
                          selectedRecipientIds.length === 0 ||
                          sendingTwist
                            ? 0.55
                            : 1,
                      }}
                    >
                      {sendingTwist
                        ? 'Sending Twist...'
                        : `Send Twist${selectedRecipientIds.length > 0
                            ? ` to ${selectedRecipientIds.length}`
                            : ''
                          }`}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* KAMERAN */}
        {cameraState !== 'preview' && (
          <>
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
                      display: ['glam', 'nolips'].includes(filter) ? 'none' : 'block',
                    }}
                  />

                  <canvas
                    ref={makeupCanvasRef}
                    className="camera-canvas makeup-canvas"
                    style={{
                      display: ['glam', 'nolips'].includes(filter) ? 'block' : 'none',
                    }}
                  />

                  <span className="live-label">
                    <span />
                    LIVE
                  </span>

                  {isRecording && (
                    <div className="recording-indicator">
                      <span />
                      REC

                      <div className="recording-progress">
                        <span
                          style={{
                            width: `${recordingProgress}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <button
                  className="camera-start-area"
                  onClick={startCamera}
                  disabled={cameraState === 'loading'}
                  aria-label="Starta kameran"
                >
                  <span className="camera-start-circle">
                    {cameraState === 'loading' ? '…' : '📷'}
                  </span>

                  <span className="camera-start-text">
                    {cameraState === 'loading'
                      ? 'Startar kameran…'
                      : cameraState === 'error'
                        ? 'Försök starta kameran igen'
                        : 'Tryck för att öppna kameran'}
                  </span>
                </button>
              )}

              <span className="camera-corner corner-tl" />
              <span className="camera-corner corner-tr" />
              <span className="camera-corner corner-bl" />
              <span className="camera-corner corner-br" />
            </div>

            <div className="camera-controls">
              <div className="shutter-slot">
                {cameraState === 'live' && (
                  <button
                    className={`shutter-button ${
                      isRecording ? 'recording' : ''
                    }`}
                    onPointerDown={handleShutterPointerDown}
                    onPointerUp={handleShutterPointerUp}
                    onPointerLeave={handleShutterPointerCancel}
                    onPointerCancel={handleShutterPointerCancel}
                    aria-label="Tryck för foto, håll in för video"
                    disabled={
                      isRecording && !pointerDownRef.current
                    }
                  />
                )}
              </div>

              <div className="filter-carousel-window">
                <div
                  className="filter-carousel"
                  style={{
                    transform: `translateX(calc(50% - ${selectedFilterIndex * 64}px - 27px))`,
                  }}
                >
                  {FILTERS.map((item) => (
                    <button
                      key={item.id}
                      className={`filter-option ${
                        filter === item.id ? 'selected' : ''
                      }`}
                      onClick={() => selectFilter(item)}
                      aria-label={item.label}
                      aria-pressed={filter === item.id}
                      title={item.label}
                    >
                      {item.symbol && <span>{item.symbol}</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {!['glam', 'nolips'].includes(filter) && cameraState === 'live' && (
              <p className="selected-filter-label">
                {FILTERS.find((item) => item.id === filter)?.label}
              </p>
            )}
          </>
        )}

        {errorMessage && (
          <p className="camera-error" role="alert">
            {errorMessage}
          </p>
        )}

        {cameraState === 'live' && (
          <button
            className="camera-close-button"
            onClick={stopCamera}
          >
            Stäng kameran
          </button>
        )}
      </div>
    </section>
  )
}