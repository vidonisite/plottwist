import { drawBigEyes } from './bigeyes.jsx'

const FACE_SHRINK = 0.7
const SHRINK_RADIUS_X = 0.72
const SHRINK_RADIUS_Y = 0.7
const SHRINK_FULL_STRENGTH_RADIUS = 0.5
const EYE_SCALE = 3.8 / FACE_SHRINK
const EYE_SEPARATION = 1.55 / FACE_SHRINK

let shrinkCanvas = null
let shrinkContext = null
let shrinkImage = null
let shrinkWidth = 0
let shrinkHeight = 0

function getPoint(landmarks, index) {
  const point = landmarks[index]
  return point && Number.isFinite(point.x) && Number.isFinite(point.y)
    ? point
    : null
}

function ensureBuffers(width, height) {
  if (
    !shrinkCanvas ||
    shrinkWidth !== width ||
    shrinkHeight !== height
  ) {
    shrinkCanvas = document.createElement('canvas')
    shrinkCanvas.width = width
    shrinkCanvas.height = height
    shrinkContext = shrinkCanvas.getContext('2d', {
      willReadFrequently: true,
    })
    shrinkImage = shrinkContext?.createImageData(width, height) ?? null
    shrinkWidth = width
    shrinkHeight = height
  }
}

function smoothstep(value) {
  const t = Math.min(1, Math.max(0, value))
  return t * t * (3 - 2 * t)
}

function drawShrunkFace(source, centerX, centerY, radiusX, radiusY) {
  const width = source.width
  const height = source.height
  const sourceContext = source.getContext('2d')

  if (!sourceContext) return false

  ensureBuffers(width, height)
  if (!shrinkContext || !shrinkImage) return false

  const input = sourceContext.getImageData(0, 0, width, height).data
  const output = shrinkImage.data
  output.set(input)

  const left = Math.max(0, Math.floor(centerX - radiusX))
  const right = Math.min(width, Math.ceil(centerX + radiusX))
  const top = Math.max(0, Math.floor(centerY - radiusY))
  const bottom = Math.min(height, Math.ceil(centerY + radiusY))
  const scaleFactor = 1 / FACE_SHRINK - 1

  for (let y = top; y < bottom; y++) {
    const dy = y - centerY
    const normalizedY = dy / radiusY

    for (let x = left; x < right; x++) {
      const dx = x - centerX
      const normalizedX = dx / radiusX
      const radius = Math.sqrt(
        normalizedX * normalizedX + normalizedY * normalizedY
      )

      if (radius >= 1) continue

      const transition = smoothstep(
        (radius - SHRINK_FULL_STRENGTH_RADIUS) /
          (1 - SHRINK_FULL_STRENGTH_RADIUS)
      )
      const influence = 1 - transition
      const sampleX = Math.min(
        width - 1,
        Math.max(0, centerX + dx * (1 + scaleFactor * influence))
      )
      const sampleY = Math.min(
        height - 1,
        Math.max(0, centerY + dy * (1 + scaleFactor * influence))
      )
      const x0 = Math.floor(sampleX)
      const y0 = Math.floor(sampleY)
      const x1 = Math.min(x0 + 1, width - 1)
      const y1 = Math.min(y0 + 1, height - 1)
      const xBlend = sampleX - x0
      const yBlend = sampleY - y0
      const topLeft = (y0 * width + x0) * 4
      const topRight = (y0 * width + x1) * 4
      const bottomLeft = (y1 * width + x0) * 4
      const bottomRight = (y1 * width + x1) * 4
      const outputIndex = (y * width + x) * 4

      for (let channel = 0; channel < 4; channel++) {
        const topValue =
          input[topLeft + channel] * (1 - xBlend) +
          input[topRight + channel] * xBlend
        const bottomValue =
          input[bottomLeft + channel] * (1 - xBlend) +
          input[bottomRight + channel] * xBlend

        output[outputIndex + channel] =
          topValue * (1 - yBlend) + bottomValue * yBlend
      }
    }
  }

  shrinkContext.putImageData(shrinkImage, 0, 0)
  return true
}

export function drawBadVibes(source, outputContext, landmarks) {
  if (!source || !outputContext || !landmarks) return

  const width = source.width
  const height = source.height
  if (!width || !height) return

  const leftFace = getPoint(landmarks, 234)
  const rightFace = getPoint(landmarks, 454)
  const forehead = getPoint(landmarks, 10)
  const chin = getPoint(landmarks, 152)

  if (!leftFace || !rightFace || !forehead || !chin) {
    outputContext.clearRect(0, 0, width, height)
    outputContext.drawImage(source, 0, 0, width, height)
    return
  }

  const centerX = ((leftFace.x + rightFace.x) / 2) * width
  const centerY = ((forehead.y + chin.y) / 2) * height
  const radiusX = Math.abs(rightFace.x - leftFace.x) * width * SHRINK_RADIUS_X
  const radiusY = Math.abs(chin.y - forehead.y) * height * SHRINK_RADIUS_Y

  if (
    radiusX < 10 ||
    radiusY < 10 ||
    !drawShrunkFace(source, centerX, centerY, radiusX, radiusY)
  ) {
    outputContext.clearRect(0, 0, width, height)
    outputContext.drawImage(source, 0, 0, width, height)
    return
  }

  const normalizedCenterX = centerX / width
  const normalizedCenterY = centerY / height
  const shrunkLandmarks = landmarks.map((point) =>
    point
      ? {
          ...point,
          x: normalizedCenterX + (point.x - normalizedCenterX) * FACE_SHRINK,
          y: normalizedCenterY + (point.y - normalizedCenterY) * FACE_SHRINK,
        }
      : point
  )

  drawBigEyes(
    shrinkCanvas,
    outputContext,
    shrunkLandmarks,
    {
      eyeScale: EYE_SCALE,
      eyeSeparation: EYE_SEPARATION,
      mouthScale: 1,
    }
  )
}
