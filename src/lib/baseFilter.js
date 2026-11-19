import { OpenMakeup } from 'open-makeup-sdk'

const MEDIAPIPE_VERSION = '0.4.1633559619'

const MEDIAPIPE_URL = 
  `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${MEDIAPIPE_VERSION}`

const CAMERA_UTILS_URL = 
  'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3/camera_utils.js'

const ASSETS_URL = 
  'https://cdn.jsdelivr.net/npm/open-makeup-sdk/assets'

function loadFaceMesh() {
  if (window.FaceMesh) {
    return Promise.resolve(window.FaceMesh)
  }

  return new Promise((resolve, reject) => {
    let script = document.querySelector(
      'script[data-openmakeup-facemesh]'
    )

    if (!script) {
      script = document.createElement('script')
      script.src = `${MEDIAPIPE_URL}/face_mesh.js`
      script.dataset.openmakeupFacemesh = 'true'
      document.head.appendChild(script)
    }

    script.addEventListener('load', () => {
      if (window.FaceMesh) {
        resolve(window.FaceMesh)
      } else {
        reject(new Error('MediaPipe FaceMesh kunde inte laddas.'))
      }
    }, { once: true })

    script.addEventListener('error', () => {
      reject(new Error('Kunde inte ladda MediaPipe FaceMesh.'))
    }, { once: true })
  })
}

function loadCameraUtils() {
  if (window.Camera) {
    return Promise.resolve(window.Camera)
  }

  return new Promise((resolve, reject) => {
    let script = document.querySelector(
      'script[data-openmakeup-camera]'
    )

    if (!script) {
      script = document.createElement('script')
      script.src = CAMERA_UTILS_URL
      script.dataset.openmakeupCamera = 'true'
      document.head.appendChild(script)
    }

    script.addEventListener('load', () => {
      if (window.Camera) {
        resolve(window.Camera)
      } else {
        reject(new Error('MediaPipe Camera kunde inte laddas.'))
      }
    }, { once: true })

    script.addEventListener('error', () => {
      reject(new Error('Kunde inte ladda MediaPipe Camera.'))
    }, { once: true })
  })
}

class ExistingVideoCamera {
  constructor(video, options = {}) {
    this.video = video
    this.onFrame = options.onFrame

    this.animationId = null
    this.running = false
    this.busy = false
  }

  start() {
    if (this.running) return

    this.running = true
    this.tick()
  }

  tick = () => {
    if (!this.running) return

    this.animationId = requestAnimationFrame(this.tick)

    if (this.busy || this.video.readyState < 2) {
      return
    }

    this.busy = true

    try {
      Promise.resolve(this.onFrame())
        .catch((error) => {
          console.error('OpenMakeup frame error:', error)
        })
        .finally(() => {
          this.busy = false
        })
    } catch (error) {
      this.busy = false
      console.error('OpenMakeup frame error:', error)
    }
  }

  stop() {
    this.running = false

    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }
}

async function waitForMaterials(engine) {
  const start = Date.now()

  while (Date.now() - start < 15000) {
    const ready =
      engine.foundationMat &&
      engine.blushMat &&
      engine.lipsMat &&
      engine.eyeShadowMat &&
      engine.eyeLineMat &&
      engine.mascaraMat

    if (ready) return

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error('OpenMakeup tog för lång tid på sig att ladda.')
}

export async function initOpenMakeupFilter(video, renderCanvas, filterName, setupCallback) {
  await Promise.all([
    loadFaceMesh(),
    loadCameraUtils()
  ])

  const gl = renderCanvas.getContext('webgl2', {
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  })

  if (!gl) {
    throw new Error(`WebGL 2 kunde inte startas för ${filterName}-filtret.`)
  }

  const makeup = new OpenMakeup({
    video,
    renderCanvas,

    assetsBaseUrl: ASSETS_URL,
    mediapipeBaseUrl: MEDIAPIPE_URL,

    camera: {
      width: 640,
      height: 640
    },

    faceMesh: {
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6
    }
  })

  try {
    const mediaPipeCameraClass = window.Camera
    window.Camera = ExistingVideoCamera

    try {
      await makeup.init()
    } finally {
      window.Camera = mediaPipeCameraClass
    }

    await waitForMaterials(makeup.engine)

    if (setupCallback) {
      await setupCallback(makeup)
    }

    return makeup
  } catch (error) {
    makeup.dispose()
    throw error
  }
}
