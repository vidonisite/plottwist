const EYE_SCALE = 1.4
const EDGE_BLUR = 1.5

// Konturpunkter för ögonen i MediaPipes Face Landmarker-modell.
const EYE_CONTOURS = [
  [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7],
  [362, 398, 384, 385, 386, 387, 388, 263, 466, 382, 381, 380, 374, 373, 390, 249]
]

let eyeLayers = []

function getEyeLayers(width, height) {
  const sameSize = eyeLayers.length === 2 &&
    eyeLayers.every((layer) =>
      layer.canvas.width === width &&
      layer.canvas.height === height
    )

  if (sameSize) return eyeLayers

  eyeLayers = EYE_CONTOURS.map(() => {
    const canvas = document.createElement('canvas')
    const mask = document.createElement('canvas')

    canvas.width = width
    canvas.height = height
    mask.width = width
    mask.height = height

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

  if (maxX - minX < 4 || maxY - minY < 2) return null

  return {
    points: pixelPoints,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  }
}

function drawTransparentEye(source, layer, eye) {
  const { canvas, context, mask, maskContext } = layer
  const { width, height } = source

  if (!context || !maskContext) return

  // Börja med en kopia av originalbilden.
  context.clearRect(0, 0, width, height)
  context.globalCompositeOperation = 'source-over'
  context.filter = 'none'
  context.drawImage(source, 0, 0, width, height)

  // Skapa en separat mask: bara själva ögonformen ska vara synlig.
  maskContext.clearRect(0, 0, width, height)
  maskContext.globalCompositeOperation = 'source-over'
  maskContext.filter = `blur(${EDGE_BLUR}px)`
  maskContext.fillStyle = '#fff'
  maskContext.beginPath()

  eye.points.forEach((point, index) => {
    // Expandera konturen lite runt mitten för att inkludera ögonlocken.
    const x = eye.centerX + (point.x - eye.centerX) * 1.08
    const y = eye.centerY + (point.y - eye.centerY) * 1.08

    if (index === 0) {
      maskContext.moveTo(x, y)
    } else {
      maskContext.lineTo(x, y)
    }
  })

  maskContext.closePath()
  maskContext.fill()
  maskContext.filter = 'none'

  // Behåll bara pixlarna där ögonmasken finns.
  // Allt utanför ögat blir transparent.
  context.globalCompositeOperation = 'destination-in'
  context.drawImage(mask, 0, 0)
  context.globalCompositeOperation = 'source-over'
}

export function drawBigEyes(source, outputContext, landmarks) {
  if (!source || !outputContext || !landmarks) return

  const { width, height } = source

  // Rita den vanliga kamerabilden först.
  outputContext.clearRect(0, 0, width, height)
  outputContext.drawImage(source, 0, 0, width, height)

  const layers = getEyeLayers(width, height)

  EYE_CONTOURS.forEach((indices, index) => {
    const eye = getEye(landmarks, indices, width, height)

    if (!eye) return

    const layer = layers[index]

    // Klipp ut ögat med genomskinlig bakgrund.
    drawTransparentEye(source, layer, eye)

    // Förstora det utklippta ögat runt dess mittpunkt.
    // Eftersom allt utanför masken är transparent följer inte
    // näsan eller resten av ansiktet med.
    const x = eye.centerX * (1 - EYE_SCALE)
    const y = eye.centerY * (1 - EYE_SCALE)

    outputContext.drawImage(
      layer.canvas,
      x,
      y,
      width * EYE_SCALE,
      height * EYE_SCALE
    )
  })
}