
const DEFAULT_STRENGTH = 2.8

export function drawFishEye(sourceCanvas, context, strength = DEFAULT_STRENGTH) {
  const width = sourceCanvas.width
  const height = sourceCanvas.height

  const sourceContext = sourceCanvas.getContext('2d')
  const sourceImage = sourceContext.getImageData(0, 0, width, height)
  const source = sourceImage.data

  const outputImage = context.createImageData(width, height)
  const output = outputImage.data

  const centerX = (width - 1) / 2
  const centerY = (height - 1) / 2

  // Radien gör att cirkeln precis når mitten av varje bildkant.
  const radius = Math.min(width, height) / 2
  const power = Math.max(1, strength)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX
      const dy = y - centerY
      const distance = Math.sqrt(dx * dx + dy * dy)
      const outputIndex = (y * width + x) * 4

      // Allt utanför den runda linsen blir svart.
      if (distance > radius) {
        output[outputIndex] = 0
        output[outputIndex + 1] = 0
        output[outputIndex + 2] = 0
        output[outputIndex + 3] = 255
        continue
      }

      const normalizedDistance = distance / radius

      // Förstorar mitten och trycker ihop bilden mot cirkelkanten.
      const sourceDistance =
        radius * Math.pow(normalizedDistance, power)

      const angle = Math.atan2(dy, dx)

      const sourceX = Math.round(
        centerX + Math.cos(angle) * sourceDistance
      )
      const sourceY = Math.round(
        centerY + Math.sin(angle) * sourceDistance
      )

      const safeX = Math.max(0, Math.min(width - 1, sourceX))
      const safeY = Math.max(0, Math.min(height - 1, sourceY))
      const sourceIndex = (safeY * width + safeX) * 4

      output[outputIndex] = source[sourceIndex]
      output[outputIndex + 1] = source[sourceIndex + 1]
      output[outputIndex + 2] = source[sourceIndex + 2]
      output[outputIndex + 3] = source[sourceIndex + 3]
    }
  }

  context.putImageData(outputImage, 0, 0)
}
