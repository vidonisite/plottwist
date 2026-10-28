const EYE_SCALE = 4.5
const MOUTH_SCALE = 2.5
const EDGE_BLUR = 0
const EYE_PADDING = 0.2
const MOUTH_PADDING = 0.12
const EYE_SEPARATION = 0.94

// Konturpunkter från MediaPipe Face Landmarker.
const EYE_CONTOURS = [
  [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
  [362, 398, 384, 385, 386, 387, 388, 263, 466, 382, 381, 380, 374, 373, 390, 249]
]

// Yttre kontur runt hela munnen, inklusive läpparna.
const MOUTH_CONTOUR = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
  308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78
]

let eyeLayers = []
let mouthLayer = null

function createLayer() {
  const canvas = document.createElement('canvas')
  const mask = document.createElement('canvas')

  return {
    canvas,
    context: canvas.getContext('2d'),
    mask,
    maskContext: mask.getContext('2d')
  }
}

function getLayers() {
  if (eyeLayers.length !== 2) {
    eyeLayers = EYE_CONTOURS.map(() => createLayer())
  }

  if (!mouthLayer) {
    mouthLayer = createLayer()
  }

  return { eyes: eyeLayers, mouth: mouthLayer }
}

function getFeature(landmarks, indices, width, height, paddingFactor) {
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

  const featureWidth = maxX - minX
  const featureHeight = maxY - minY

  if (featureWidth < 4 || featureHeight < 2) return null

  const paddingX = Math.max(3, featureWidth * paddingFactor)
  const paddingY = Math.max(3, featureHeight * paddingFactor)

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

function prepareLayer(source, layer, feature, expansion = 1.04) {
  const { canvas, mask, context, maskContext } = layer

  if (!context || !maskContext) return false

  const { cropX, cropY, cropWidth, cropHeight } = feature

  if (cropWidth <= 0 || cropHeight <= 0) return false

  // Anpassa canvasen till urklippets storlek.
  if (canvas.width !== cropWidth || canvas.height !== cropHeight) {
    canvas.width = cropWidth
    canvas.height = cropHeight
    mask.width = cropWidth
    mask.height = cropHeight
  }

  // Högsta tillgängliga interpoleringskvalitet.
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  context.clearRect(0, 0, cropWidth, cropHeight)
  maskContext.clearRect(0, 0, cropWidth, cropHeight)

  // Kopiera pixlarna från originalbilden utan extra nedskalning.
  context.globalCompositeOperation = 'source-over'
  context.filter = 'none'
  context.drawImage(
    source,
    cropX, cropY, cropWidth, cropHeight,
    0, 0, cropWidth, cropHeight
  )

  // Skapa en skarp mask. Ingen blur används.
  maskContext.globalCompositeOperation = 'source-over'
  maskContext.filter = `blur(${EDGE_BLUR}px)`
  maskContext.fillStyle = '#fff'
  maskContext.beginPath()

  feature.points.forEach((point, index) => {
    const x =
      feature.centerX +
      (point.x - feature.centerX) * expansion -
      cropX

    const y =
      feature.centerY +
      (point.y - feature.centerY) * expansion -
      cropY

    if (index === 0) {
      maskContext.moveTo(x, y)
    } else {
      maskContext.lineTo(x, y)
    }
  })

  maskContext.closePath()
  maskContext.fill()
  maskContext.filter = 'none'

  // Gör allt utanför konturen genomskinligt.
  context.globalCompositeOperation = 'destination-in'
  context.drawImage(mask, 0, 0)
  context.globalCompositeOperation = 'source-over'

  return true
}

function drawSticker(outputContext, layer, feature, scale) {
  const { canvas } = layer

  const drawWidth = feature.cropWidth * scale
  const drawHeight = feature.cropHeight * scale

  // Placera urklippet centrerat på den ursprungliga funktionen.
  const x = feature.centerX - drawWidth / 2
  const y = feature.centerY - drawHeight / 2

  outputContext.drawImage(
    canvas,
    x,
    y,
    drawWidth,
    drawHeight
  )

  return {
    left: x,
    right: x + drawWidth,
    top: y,
    bottom: y + drawHeight
  }
}

export function drawBigEyes(source, outputContext, landmarks) {
  if (!source || !outputContext || !landmarks) return

  const { width, height } = source
  const { eyes, mouth } = getLayers()

  outputContext.clearRect(0, 0, width, height)

  outputContext.imageSmoothingEnabled = true
  outputContext.imageSmoothingQuality = 'high'
  outputContext.filter = 'none'

  // Originalbilden ska alltid ligga underst.
  outputContext.drawImage(source, 0, 0, width, height)

  // Hitta och förbered båda ögonen först.
  const eyeFeatures = EYE_CONTOURS.map((contour) =>
    getFeature(landmarks, contour, width, height, EYE_PADDING)
  )

  const preparedEyes = eyeFeatures.map((feature, index) => {
    if (!feature) return null

    const ok = prepareLayer(
      source,
      eyes[index],
      feature,
      1.08
    )

    return ok ? feature : null
  })

  const [leftEye, rightEye] = preparedEyes

  // Börja med önskad skala. Sänk den bara om det behövs
  // för att de två sticker-bildernas rektanglar inte ska överlappa.
  let actualEyeScale = EYE_SCALE

  if (leftEye && rightEye) {
    const centerDistance = Math.abs(
      rightEye.centerX - leftEye.centerX
    )

    const combinedHalfWidths =
      (leftEye.cropWidth + rightEye.cropWidth) / 2

    if (combinedHalfWidths > 0) {
      const maxNonOverlappingScale =
        (centerDistance * EYE_SEPARATION) / combinedHalfWidths

      actualEyeScale = Math.min(
        EYE_SCALE,
        maxNonOverlappingScale
      )
    }
  }

  // Rita ögonen först, vart och ett på sin egen canvas.
  preparedEyes.forEach((feature, index) => {
    if (!feature) return

    drawSticker(
      outputContext,
      eyes[index],
      feature,
      Math.max(1, actualEyeScale)
    )
  })

  // Gör samma typ av sticker med munnen.
  const mouthFeature = getFeature(
    landmarks,
    MOUTH_CONTOUR,
    width,
    height,
    MOUTH_PADDING
  )

  if (
    mouthFeature &&
    prepareLayer(source, mouth, mouthFeature, 1.02)
  ) {
    drawSticker(
      outputContext,
      mouth,
      mouthFeature,
      MOUTH_SCALE
    )
  }
}