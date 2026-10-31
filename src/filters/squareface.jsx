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

  const boxHalfW = faceWidth * 0.82
  const boxHalfH = faceHeight * 0.9
  const margin = 0.18

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const outputIndex = (y * width + x) * 4

      const dx = x - centerX
      const dy = y - centerY
      const nx = dx / boxHalfW
      const ny = dy / boxHalfH

      if (Math.abs(nx) > 1.2 || Math.abs(ny) > 1.2) {
        dst[outputIndex] = src[outputIndex]
        dst[outputIndex + 1] = src[outputIndex + 1]
        dst[outputIndex + 2] = src[outputIndex + 2]
        dst[outputIndex + 3] = src[outputIndex + 3]
        continue
      }

      const dist = Math.max(Math.abs(nx), Math.abs(ny))
      const edgeFade = dist > 0.82 ? (1.2 - dist) / 0.38 : 1

      const stretchX = 1 + (1 - Math.min(1, Math.abs(ny))) * 0.5
      const stretchY = 1 + (1 - Math.min(1, Math.abs(nx))) * 0.45

      const sampleX = centerX + dx * stretchX
      const sampleY = centerY + dy * stretchY

      const sx = clamp(Math.round(sampleX), 0, width - 1)
      const sy = clamp(Math.round(sampleY), 0, height - 1)
      const sourceIndex = (sy * width + sx) * 4

      if (dist <= 0.82) {
        dst[outputIndex] = src[sourceIndex]
        dst[outputIndex + 1] = src[sourceIndex + 1]
        dst[outputIndex + 2] = src[sourceIndex + 2]
        dst[outputIndex + 3] = src[sourceIndex + 3]
        continue
      }

      const alpha = clamp(edgeFade, 0, 1)

      for (let channel = 0; channel < 3; channel++) {
        dst[outputIndex + channel] =
          src[outputIndex + channel] * (1 - alpha) +
          src[sourceIndex + channel] * alpha
      }

      dst[outputIndex + 3] = src[outputIndex + 3]
    }
  }

  context.putImageData(output, 0, 0)
}
