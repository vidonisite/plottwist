export function drawSquareFace(sourceCanvas, context, landmarks) {
  if (!landmarks || landmarks.length < 455) {
    context.drawImage(sourceCanvas, 0, 0)
    return
  }

  const width = sourceCanvas.width
  const height = sourceCanvas.height

  const left = landmarks[234]
  const right = landmarks[454]
  const forehead = landmarks[10]
  const chin = landmarks[152]

  const centerX = ((left.x + right.x) / 2) * width
  const topY = forehead.y * height
  const bottomY = chin.y * height

  const faceWidth = Math.abs(right.x - left.x) * width
  const faceHeight = Math.abs(bottomY - topY)

  if (faceWidth < 20 || faceHeight < 20) {
    context.drawImage(sourceCanvas, 0, 0)
    return
  }

  const centerY = (topY + bottomY) / 2
  const halfHeight = faceHeight / 2
  const halfWidth = faceWidth / 2

  const sourceContext = sourceCanvas.getContext('2d')
  const source = sourceContext.getImageData(0, 0, width, height)
  const output = context.createImageData(width, height)

  const src = source.data
  const dst = output.data

  // Hur mycket bredare käken blir.
  const maxWidening = 0.32

  for (let y = 0; y < height; y++) {
    const verticalPosition = (y - centerY) / halfHeight

    if (Math.abs(verticalPosition) > 1.1) {
      const rowStart = y * width * 4
      dst.set(src.subarray(rowStart, rowStart + width * 4), rowStart)
      continue
    }

    const lowerFace = Math.max(
      0,
      Math.min(1, (verticalPosition - 0.05) / 0.85)
    )

    // Mjuk övergång så att förvrängningen inte börjar tvärt.
    const smoothLowerFace = lowerFace * lowerFace * (3 - 2 * lowerFace)

    const widening = 1 + maxWidening * smoothLowerFace

    // En något kantigare ansiktsform än en vanlig oval.
    const ovalShape = Math.pow(
      Math.max(0, 1 - Math.pow(Math.abs(verticalPosition), 3.2)),
      0.34
    )

    const originalRadius = halfWidth * ovalShape
    const expandedRadius = originalRadius * widening

    for (let x = 0; x < width; x++) {
      const dx = x - centerX
      const distance = Math.abs(dx)

      const outputIndex = (y * width + x) * 4

      if (distance > expandedRadius || expandedRadius < 1) {
        dst[outputIndex] = src[outputIndex]
        dst[outputIndex + 1] = src[outputIndex + 1]
        dst[outputIndex + 2] = src[outputIndex + 2]
        dst[outputIndex + 3] = src[outputIndex + 3]
        continue
      }

      const sourceX = Math.round(centerX + dx / widening)
      const safeX = Math.max(0, Math.min(width - 1, sourceX))
      const sourceIndex = (y * width + safeX) * 4

      // Mjukar ut kanten mot den oförändrade bilden.
      const edgeBlend = Math.min(1, (expandedRadius - distance) / 5)
      const blend = Math.max(0, Math.min(1, edgeBlend))

      for (let channel = 0; channel < 4; channel++) {
        dst[outputIndex + channel] =
          src[outputIndex + channel] * (1 - blend) +
          src[sourceIndex + channel] * blend
      }
    }
  }

  context.putImageData(output, 0, 0)
}
