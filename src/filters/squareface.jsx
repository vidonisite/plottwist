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

  if (!left || !right || !forehead || !chin) {
    context.drawImage(sourceCanvas, 0, 0)
    return
  }

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

  for (let y = 0; y < height; y++) {
    const dy = y - centerY
    const ny = dy / halfHeight

    if (Math.abs(ny) > 1.25) {
      const rowStart = y * width * 4
      dst.set(src.subarray(rowStart, rowStart + width * 4), rowStart)
      continue
    }

    const verticalBlend = Math.max(0, 1 - Math.abs(ny))
    const squareWidthFactor = 0.72 + 0.48 * verticalBlend
    const jawFlatten = 0.22 * Math.max(0, ny + 0.5)
    const maxBoxWidth = halfWidth * (squareWidthFactor + jawFlatten)

    for (let x = 0; x < width; x++) {
      const dx = x - centerX
      const nx = dx / halfWidth

      const outputIndex = (y * width + x) * 4

      if (Math.abs(nx) > 1.25 || Math.abs(ny) > 1.25) {
        dst[outputIndex] = src[outputIndex]
        dst[outputIndex + 1] = src[outputIndex + 1]
        dst[outputIndex + 2] = src[outputIndex + 2]
        dst[outputIndex + 3] = src[outputIndex + 3]
        continue
      }

      const signedDx = Math.sign(dx || 1) * Math.min(Math.abs(dx), maxBoxWidth)
      const sourceX = centerX + signedDx
      const safeX = Math.max(0, Math.min(width - 1, Math.round(sourceX)))
      const sourceIndex = (y * width + safeX) * 4

      const edgeBlend = Math.max(
        0,
        1 - Math.min(1, Math.abs(nx) / 1.25)
      )

      for (let channel = 0; channel < 4; channel++) {
        dst[outputIndex + channel] =
          src[outputIndex + channel] * (1 - edgeBlend) +
          src[sourceIndex + channel] * edgeBlend
      }
    }
  }

  context.putImageData(output, 0, 0)
}
