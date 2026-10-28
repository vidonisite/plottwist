const DEFAULT_STRENGTH = 0.85

let cachedWidth = 0
let cachedHeight = 0
let cachedStrength = -1
let mapX = null
let mapY = null
let sourceCanvas = null
let sourceContext = null
let outputImage = null

function createMapping(width, height, strength) {
  const size = width * height

  mapX = new Float32Array(size)
  mapY = new Float32Array(size)

  const centerX = (width - 1) / 2
  const centerY = (height - 1) / 2
  const radius = Math.min(width, height) / 2

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - centerX) / radius
      const dy = (y - centerY) / radius
      const distance = Math.sqrt(dx * dx + dy * dy)

      // Förstorad mitt och kraftig böjning mot kanterna.
      const factor =
        1 + strength * distance * distance

      const index = y * width + x

      mapX[index] = centerX + dx * factor * radius
      mapY[index] = centerY + dy * factor * radius
    }
  }

  cachedWidth = width
  cachedHeight = height
  cachedStrength = strength
}

function ensureBuffers(width, height) {
  if (
    !sourceCanvas ||
    sourceCanvas.width !== width ||
    sourceCanvas.height !== height
  ) {
    sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = width
    sourceCanvas.height = height

    sourceContext = sourceCanvas.getContext('2d', {
      willReadFrequently: true,
    })

    outputImage = null
  }

  if (
    !outputImage ||
    outputImage.width !== width ||
    outputImage.height !== height
  ) {
    outputImage = new ImageData(width, height)
  }
}

export function drawFishEye(
  source,
  outputContext,
  strength = DEFAULT_STRENGTH
) {
  if (!source || !outputContext) return

  const width = source.videoWidth || source.width
  const height = source.videoHeight || source.height

  if (!width || !height) return

  strength = Math.max(0, Math.min(1.5, strength))

  ensureBuffers(width, height)

  if (
    cachedWidth !== width ||
    cachedHeight !== height ||
    cachedStrength !== strength
  ) {
    createMapping(width, height, strength)
  }

  sourceContext.drawImage(source, 0, 0, width, height)

  const input = sourceContext.getImageData(
    0, 0, width, height
  ).data

  const output = outputImage.data
  const size = width * height

  for (let i = 0; i < size; i++) {
    const sx = mapX[i]
    const sy = mapY[i]
    const out = i * 4

    if (
      sx < 0 ||
      sy < 0 ||
      sx >= width - 1 ||
      sy >= height - 1
    ) {
      output[out] = 0
      output[out + 1] = 0
      output[out + 2] = 0
      output[out + 3] = 255
      continue
    }

    const x0 = Math.floor(sx)
    const y0 = Math.floor(sy)
    const x1 = x0 + 1
    const y1 = y0 + 1

    const fx = sx - x0
    const fy = sy - y0

    const p00 = (y0 * width + x0) * 4
    const p10 = (y0 * width + x1) * 4
    const p01 = (y1 * width + x0) * 4
    const p11 = (y1 * width + x1) * 4

    for (let channel = 0; channel < 3; channel++) {
      const top =
        input[p00 + channel] * (1 - fx) +
        input[p10 + channel] * fx

      const bottom =
        input[p01 + channel] * (1 - fx) +
        input[p11 + channel] * fx

      output[out + channel] =
        top * (1 - fy) + bottom * fy
    }

    output[out + 3] = 255
  }

  outputContext.putImageData(outputImage, 0, 0)
}