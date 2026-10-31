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
  const centerY = ((forehead.y + chin.y) / 2) * height

  const faceWidth = Math.abs(right.x - left.x) * width
  const faceHeight = Math.abs(chin.y - forehead.y) * height

  if (faceWidth < 20 || faceHeight < 20) {
    context.drawImage(sourceCanvas, 0, 0)
    return
  }

  const sourceContext = sourceCanvas.getContext('2d')
  const source = sourceContext.getImageData(0, 0, width, height)
  const output = context.createImageData(width, height)

  const src = source.data
  const dst = output.data

  const boxHalfW = faceWidth * 0.78
  const boxHalfH = faceHeight * 0.82

  for (let y = 0; y < height; y++) {
    const dy = y - centerY
    const ny = dy / boxHalfH

    if (Math.abs(ny) > 1.2) {
      const rowStart = y * width * 4
      dst.set(src.subarray(rowStart, rowStart + width * 4), rowStart)
      continue
    }

    for (let x = 0; x < width; x++) {
      const dx = x - centerX
      const nx = dx / boxHalfW

      const outputIndex = (y * width + x) * 4

      if (Math.abs(nx) > 1.2 || Math.abs(ny) > 1.2) {
        dst[outputIndex] = src[outputIndex]
        dst[outputIndex + 1] = src[outputIndex + 1]
        dst[outputIndex + 2] = src[outputIndex + 2]
        dst[outputIndex + 3] = src[outputIndex + 3]
        continue
      }

      const distFromCenter = Math.max(Math.abs(nx), Math.abs(ny))
      const stretchX = 1 + 1.3 * Math.max(0, 1 - Math.abs(ny))
      const stretchY = 1 + 1.1 * Math.max(0, 1 - Math.abs(nx))

      const sourceX = centerX + dx * stretchX
      const sourceY = centerY + dy * stretchY

      const sx = Math.max(0, Math.min(width - 1, Math.round(sourceX)))
      const sy = Math.max(0, Math.min(height - 1, Math.round(sourceY)))
      const sourceIndex = (sy * width + sx) * 4

      const edgeFade = Math.max(0, Math.min(1, (1.2 - distFromCenter) / 0.3))

      if (distFromCenter <= 0.9) {
        dst[outputIndex] = src[sourceIndex]
        dst[outputIndex + 1] = src[sourceIndex + 1]
        dst[outputIndex + 2] = src[sourceIndex + 2]
        dst[outputIndex + 3] = src[sourceIndex + 3]
        continue
      }

      for (let channel = 0; channel < 4; channel++) {
        dst[outputIndex + channel] =
          src[outputIndex + channel] * (1 - edgeFade) +
          src[sourceIndex + channel] * edgeFade
      }
    }
  }

  context.putImageData(output, 0, 0)
}
