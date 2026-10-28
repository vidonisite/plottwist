const VERTICAL_STRENGTH = 1.65
const GREEN_STRENGTH = 0.8

let cachedWidth = 0
let cachedHeight = 0
let cachedStrength = -1
let sourceCanvas = null
let sourceContext = null
let outputImage = null
let sourceYMap = null

function createVerticalMap(width, height, strength) {
  sourceYMap = new Float32Array(height)

  for (let y = 0; y < height; y++) {
    const position = y / Math.max(1, height - 1)

    // Mer av bildens höjd hamnar i den nedre delen.
    // Det får innehåll nära toppen att se större ut.
    sourceYMap[y] =
      Math.pow(position, strength) * (height - 1)
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

function isLikelySkin(r, g, b) {
  // En enkel uppskattning av hudton med YCbCr-färgkomponenter.
  // Det är inte en exakt hud- eller ansiktssegmentering.
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b

  return (
    cb >= 70 &&
    cb <= 135 &&
    cr >= 125 &&
    cr <= 185 &&
    r > 45 &&
    r > b * 0.85
  )
}

export function drawAlien(
  source,
  outputContext,
  verticalStrength = VERTICAL_STRENGTH
) {
  if (!source || !outputContext) return

  const width = source.videoWidth || source.width
  const height = source.videoHeight || source.height

  if (!width || !height) return

  verticalStrength = Math.max(
    1,
    Math.min(2.5, verticalStrength)
  )

  ensureBuffers(width, height)

  if (
    cachedWidth !== width ||
    cachedHeight !== height ||
    cachedStrength !== verticalStrength
  ) {
    createVerticalMap(width, height, verticalStrength)
  }

  // Rita originalbilden till en intern canvas.
  sourceContext.drawImage(source, 0, 0, width, height)

  const inputImage = sourceContext.getImageData(
    0,
    0,
    width,
    height
  )

  const input = inputImage.data
  const output = outputImage.data

  for (let y = 0; y < height; y++) {
    const sourceY = sourceYMap[y]
    const y0 = Math.floor(sourceY)
    const y1 = Math.min(y0 + 1, height - 1)
    const fy = sourceY - y0

    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      const topIndex = (y0 * width + x) * 4
      const bottomIndex = (y1 * width + x) * 4

      // Mjuk interpolation mellan två rader.
      let r =
        input[topIndex] * (1 - fy) +
        input[bottomIndex] * fy

      let g =
        input[topIndex + 1] * (1 - fy) +
        input[bottomIndex + 1] * fy

      let b =
        input[topIndex + 2] * (1 - fy) +
        input[bottomIndex + 2] * fy

      if (isLikelySkin(r, g, b)) {
        const luminance =
          0.299 * r + 0.587 * g + 0.114 * b

        // Grön ton som behåller en del av ljus och skuggor.
        const greenR = luminance * 0.12
        const greenG = luminance * 0.85 + 35
        const greenB = luminance * 0.12

        r = r * (1 - GREEN_STRENGTH) +
          greenR * GREEN_STRENGTH

        g = g * (1 - GREEN_STRENGTH) +
          greenG * GREEN_STRENGTH

        b = b * (1 - GREEN_STRENGTH) +
          greenB * GREEN_STRENGTH
      }

      output[index] = Math.min(255, Math.max(0, r))
      output[index + 1] = Math.min(255, Math.max(0, g))
      output[index + 2] = Math.min(255, Math.max(0, b))
      output[index + 3] = 255
    }
  }

  outputContext.putImageData(outputImage, 0, 0)
}