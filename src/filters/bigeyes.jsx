const EYE_SCALE = 4.5
const EDGE_BLUR = 1.5
const EYE_PADDING = 0.2

// Konturpunkter från MediaPipe Face Landmarker.
const EYE_CONTOURS = [
  [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
  [362, 398, 384, 385, 386, 387, 388, 263, 466, 382, 381, 380, 374, 373, 390, 249]
]

let eyeLayers = []

function getEyeLayers() {
  if (eyeLayers.length === 2) return eyeLayers

  eyeLayers = EYE_CONTOURS.map(() => {
    const canvas = document.createElement('canvas')
    const mask = document.createElement('canvas')

    return {
      canvas,
      context: canvas.getContext('2d'),
      mask,
      maskContext: mask.getContext('2d')
    }
  })

  return eyeLayers
}

function getEye(landmarks, indices, width, height) {
  const points = indices.map((index) => landmarks[index])

  if (points.some((point) => !point)) return null

  const pixelPoints = points.map((point) => ({
    x: point.x * width,
    y: point.y * height
  }))

  const minX = Math.min(...pixelPoints.map((p) => p.x))
  const maxX = Math.max(...pixelPoints.map((p) => p.x))
  const minY = Math.min(...pixelPoints.map((p) => p.y))
  const maxY = Math.max(...pixelPoints.map((p) => p.y))

  const eyeWidth = maxX - minX
  const eyeHeight = maxY - minY

  if (eyeWidth < 4 || eyeHeight < 2) return null

  // Extra utrymme runt hela ögat så att masken
  // inte klipps när ögonlocken inkluderas.
  const paddingX = Math.max(4, eyeWidth * EYE_PADDING)
  const paddingY = Math.max(4, eyeHeight * EYE_PADDING)

  const cropX = Math.max(0, Math.floor(minX - paddingX))
  const cropY = Math.max(0, Math.floor(minY - paddingY))
  const cropRight = Math.min(width, Math.ceil(maxX + paddingX))
  const cropBottom = Math.min(height, Math.ceil(maxY + paddingY))

  return {
    points: pixelPoints,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    cropX,
    cropY,
    cropWidth: cropRight - cropX,
    cropHeight: cropBottom - cropY
  }
}

function drawTransparentEye(source, layer, eye) {
  const { canvas, mask, } = layer
  const context = layer.context
  const maskContext = layer.maskContext

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  if (!context || !maskContext) return false

  const {
    cropX,
    cropY,
    cropWidth,
    cropHeight
  } = eye

  if (cropWidth <= 0 || cropHeight <= 0) return false

  // Gör en separat canvas som bara innehåller området
  // runt det aktuella ögat.
  if (
    canvas.width !== cropWidth ||
    canvas.height !== cropHeight
  ) {
    canvas.width = cropWidth
    canvas.height = cropHeight
    mask.width = cropWidth
    mask.height = cropHeight
  }

  context.clearRect(0, 0, cropWidth, cropHeight)
  maskContext.clearRect(0, 0, cropWidth, cropHeight)

  // Kopiera originalpixlarna från området runt ögat.
  context.globalCompositeOperation = 'source-over'
  context.filter = 'none'
  context.drawImage(
    source,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  )

  // Rita ögats kontur i den lilla canvasens koordinater.
  maskContext.globalCompositeOperation = 'source-over'
  maskContext.filter = `blur(${EDGE_BLUR}px)`
  maskContext.fillStyle = '#fff'
  maskContext.beginPath()

  eye.points.forEach((point, index) => {
    // Utöka konturen lite så att hela ögonlocket följer med.
    const x = eye.centerX +
      (point.x - eye.centerX) * 1.08 - cropX

    const y = eye.centerY +
      (point.y - eye.centerY) * 1.08 - cropY

    if (index === 0) {
      maskContext.moveTo(x, y)
    } else {
      maskContext.lineTo(x, y)
    }
  })

  maskContext.closePath()
  maskContext.fill()
  maskContext.filter = 'none'

  // Gör allt utanför ögonkonturen genomskinligt.
  context.globalCompositeOperation = 'destination-in'
  context.drawImage(mask, 0, 0)

  context.globalCompositeOperation = 'source-over'

  return true
}

export function drawBigEyes(source, outputContext, landmarks) {
  if (!source || !outputContext || !landmarks) return

  const { width, height } = source

  // Börja alltid med den vanliga kamerabilden.
  outputContext.clearRect(0, 0, width, height)
  outputContext.drawImage(source, 0, 0, width, height)
  outputContext.imageSmoothingEnabled = true
  outputContext.imageSmoothingQuality = 'high'

  const layers = getEyeLayers()

  // Rita ett förstorat urklipp för varje öga.
  EYE_CONTOURS.forEach((indices, index) => {
    const eye = getEye(landmarks, indices, width, height)

    if (!eye) return

    const layer = layers[index]

    if (!drawTransparentEye(source, layer, eye)) return

    const { cropWidth, cropHeight } = eye

    // Förstora själva ögonurklippet, inte hela kamerabilden.
    const enlargedWidth = cropWidth * EYE_SCALE
    const enlargedHeight = cropHeight * EYE_SCALE

    // Centrera urklippet runt ögats mittpunkt.
    const x = eye.centerX - enlargedWidth / 2
    const y = eye.centerY - enlargedHeight / 2

    outputContext.drawImage(
      layer.canvas,
      x,
      y,
      enlargedWidth,
      enlargedHeight
    )
  })
}