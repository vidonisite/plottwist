const DEFAULT_STRENGTH = 2.8

let cachedWidth = 0
let cachedHeight = 0
let cachedStrength = 0
let sourceXMap = null
let sourceYMap = null
let insideLensMap = null
let outputImage = null

function buildMaps(width, height, strength) {
  const size = width * height
  sourceXMap = new Uint16Array(size)
  sourceYMap = new Uint16Array(size)
  insideLensMap = new Uint8Array(size)
  outputImage = new ImageData(width, height)

  const centerX = (width - 1) / 2
  const centerY = (height - 1) / 2
  const radius = Math.min(width, height) / 2
  const power = Math.max(1, strength)
  const radiusSquared = radius * radius

  for (let y = 0; y < height; y++) {
    const dy = y - centerY

    for (let x = 0; x < width; x++) {
      const dx = x - centerX
      const index = y * width + x
      const distanceSquared = dx * dx + dy * dy

      if (distanceSquared > radiusSquared) continue

      insideLensMap[index] = 1
      const distance = Math.sqrt(distanceSquared)
      const sourceDistance = radius * Math.pow(distance / radius, power)
      const angle = Math.atan2(dy, dx)

      sourceXMap[index] = Math.max(0, Math.min(width - 1,
        Math.round(centerX + Math.cos(angle) * sourceDistance)))
      sourceYMap[index] = Math.max(0, Math.min(height - 1,
        Math.round(centerY + Math.sin(angle) * sourceDistance)))
    }
  }

  cachedWidth = width
  cachedHeight = height
  cachedStrength = strength
}

export function drawFishEye(sourceCanvas, context, strength = DEFAULT_STRENGTH) {
  if (!sourceCanvas || !context) return

  const { width, height } = sourceCanvas
  if (!width || !height) return

  if (
    width !== cachedWidth ||
    height !== cachedHeight ||
    strength !== cachedStrength ||
    !outputImage
  ) {
    buildMaps(width, height, strength)
  }

  const sourceContext = sourceCanvas.getContext('2d', {
    willReadFrequently: true,
  })
  if (!sourceContext) return

  const source = sourceContext.getImageData(0, 0, width, height).data
  const output = outputImage.data
  const size = width * height

  for (let index = 0; index < size; index++) {
    const out = index * 4

    if (!insideLensMap[index]) {
      output[out] = 0
      output[out + 1] = 0
      output[out + 2] = 0
      output[out + 3] = 255
      continue
    }

    const input = (sourceYMap[index] * width + sourceXMap[index]) * 4
    output[out] = source[input]
    output[out + 1] = source[input + 1]
    output[out + 2] = source[input + 2]
    output[out + 3] = source[input + 3]
  }

  context.putImageData(outputImage, 0, 0)
}
