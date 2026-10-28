const DEFAULT_STRENGTH = 8.38

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

  const centerX = width / 2
  const centerY = height / 2

  // Normalisera så att effekten fungerar även
  // när kamerabilden inte är kvadratisk.
  const radius = Math.min(centerX, centerY)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - centerX) / radius
      const dy = (y - centerY) / radius

      const distanceSquared = dx * dx + dy * dy

      // Radial förvrängning:
      // mitten förstoras och kanterna böjs.
      const factor =
        1 + strength * distanceSquared

      const sourceX =
        centerX + dx * factor * radius

      const sourceY =
        centerY + dy * factor * radius

      const index = y * width + x

      mapX[index] = sourceX
      mapY[index] = sourceY
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

  strength = Math.max(0, Math.min(0.8, strength))

  ensureBuffers(width, height)

  if (
    cachedWidth !== width ||
    cachedHeight !== height ||
    cachedStrength !== strength
  ) {
    createMapping(width, height, strength)
  }

  sourceContext.drawImage(source, 0, 0, width, height)

  const inputImage = sourceContext.getImageData(
    0,
    0,
    width,
    height
  )

  const input = inputImage.data
  const output = outputImage.data
  const size = width * height

  for (let i = 0; i < size; i++) {
    const sx = mapX[i]
    const sy = mapY[i]
    const out = i * 4

    // Svart utanför bildens gränser.
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

    // Bilinjär interpolation för mjukare bild.
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