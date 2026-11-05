const EYE_SCALE = 2.4
const MOUTH_SCALE = 2.0
const EYE_EXPANSION = 1.1
const MOUTH_EXPANSION = 1.06
const EDGE_BLUR = 0.7
const EYE_PADDING = 0.22
const MOUTH_PADDING = 0.14
const EYE_SEPARATION = 0.9

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

  if (points.some((point) =>
    !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)
  )) return null

  const pixelPoints = points.map((point) => ({
    x: point.x * width,
    y: point.y * height
  }))

  const minX = Math.min(...pixelPoints.map((point) => point.x))
  const maxX = Math.max(...pixelPoints.map((point) => point.x))
  const minY = Math.min(...pixelPoints.map((point) => point.y))
  const maxY = Math.max(...pixelPoints.map((point) => point.y))

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
    featureWidth,
    cropX,
    cropY,
    cropWidth: cropRight - cropX,
    cropHeight: cropBottom - cropY
  }
}

function prepareLayer(source, layer, feature, expansion) {
  const { canvas, mask, context, maskContext } = layer
  const { cropX, cropY, cropWidth, cropHeight } = feature

  if (!context || !maskContext || cropWidth <= 0 || cropHeight <= 0) {
    return false
  }

  if (canvas.width !== cropWidth || canvas.height !== cropHeight) {
    canvas.width = cropWidth
    canvas.height = cropHeight
    mask.width = cropWidth
    mask.height = cropHeight
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.globalCompositeOperation = 'source-over'
  context.filter = 'none'
  context.clearRect(0, 0, cropWidth, cropHeight)
  context.drawImage(
    source,
    cropX, cropY, cropWidth, cropHeight,
    0, 0, cropWidth, cropHeight
  )

  maskContext.globalCompositeOperation = 'source-over'
  maskContext.clearRect(0, 0, cropWidth, cropHeight)
  maskContext.filter = EDGE_BLUR > 0 ? `blur(${EDGE_BLUR}px)` : 'none'
  maskContext.fillStyle = '#fff'
  maskContext.beginPath()

  feature.points.forEach((point, index) => {
    const x = feature.centerX + (point.x - feature.centerX) * expansion - cropX
    const y = feature.centerY + (point.y - feature.centerY) * expansion - cropY

    if (index === 0) {
      maskContext.moveTo(x, y)
    } else {
      maskContext.lineTo(x, y)
    }
  })

  maskContext.closePath()
  maskContext.fill()
  maskContext.filter = 'none'

  context.globalCompositeOperation = 'destination-in'
  context.drawImage(mask, 0, 0)
  context.globalCompositeOperation = 'source-over'

  return true
}

function drawSticker(outputContext, layer, feature, scale) {
  // Scale around the detected feature center, not the crop center. This keeps
  // the sticker attached to the landmarks, including near the image edges.
  const x = feature.centerX + (feature.cropX - feature.centerX) * scale
  const y = feature.centerY + (feature.cropY - feature.centerY) * scale

  outputContext.drawImage(
    layer.canvas,
    x,
    y,
    feature.cropWidth * scale,
    feature.cropHeight * scale
  )
}

export function drawBigEyes(source, outputContext, landmarks) {
  if (!source || !outputContext || !landmarks) return

  const { width, height } = source
  const { eyes, mouth } = getLayers()

  outputContext.clearRect(0, 0, width, height)
  outputContext.imageSmoothingEnabled = true
  outputContext.imageSmoothingQuality = 'high'
  outputContext.filter = 'none'
  outputContext.drawImage(source, 0, 0, width, height)

  const preparedEyes = EYE_CONTOURS.map((contour, index) => {
    const feature = getFeature(landmarks, contour, width, height, EYE_PADDING)
    if (!feature) return null

    return prepareLayer(source, eyes[index], feature, EYE_EXPANSION)
      ? feature
      : null
  })

  const [leftEye, rightEye] = preparedEyes
  let actualEyeScale = EYE_SCALE

  if (leftEye && rightEye) {
    const centerDistance = Math.abs(rightEye.centerX - leftEye.centerX)
    const averageEyeWidth = (leftEye.featureWidth + rightEye.featureWidth) / 2
    const expandedEyeWidth = averageEyeWidth * EYE_EXPANSION

    if (expandedEyeWidth > 0) {
      // Adapt to face size and eye spacing so the enlarged eyes remain distinct.
      const spacingLimit = (centerDistance * EYE_SEPARATION) / expandedEyeWidth
      actualEyeScale = Math.min(EYE_SCALE, Math.max(1.35, spacingLimit))
    }
  }

  preparedEyes.forEach((feature, index) => {
    if (!feature) return
    drawSticker(outputContext, eyes[index], feature, actualEyeScale)
  })

  const mouthFeature = getFeature(
    landmarks,
    MOUTH_CONTOUR,
    width,
    height,
    MOUTH_PADDING
  )

  if (mouthFeature && prepareLayer(source, mouth, mouthFeature, MOUTH_EXPANSION)) {
    drawSticker(outputContext, mouth, mouthFeature, MOUTH_SCALE)
  }
}
