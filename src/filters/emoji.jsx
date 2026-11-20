const FACE_EMOJIS = ['😍', '😊', '😜', '😭', '😩', '❤️', '😂']

/**
 * Ritar en stor 2D-emoji över ansiktet med hjälp av FaceLandmarker-landmärken.
 * source är den spegelvända kamerabilden och outputContext är kamerans canvas.
 */
export function drawFaceEmoji(source, outputContext, landmarks, emoji = '😍') {
  if (!source || !outputContext) return

  const width = source.videoWidth || source.width
  const height = source.videoHeight || source.height

  if (!width || !height) return

  outputContext.clearRect(0, 0, width, height)
  outputContext.drawImage(source, 0, 0, width, height)

  if (!landmarks?.length) return

  let minX = 1
  let maxX = 0
  let minY = 1
  let maxY = 0

  for (const point of landmarks) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }

  const faceWidth = (maxX - minX) * width
  const faceHeight = (maxY - minY) * height
  if (faceWidth <= 0 || faceHeight <= 0) return

  const centerX = ((minX + maxX) / 2) * width
  const centerY = ((minY + maxY) / 2) * height

  // Ögonens yttre hörn används för att följa huvudets lutning.
  const leftEye = landmarks[33]
  const rightEye = landmarks[263]
  const angle = leftEye && rightEye
    ? -Math.atan2(
        (rightEye.y - leftEye.y) * height,
        (rightEye.x - leftEye.x) * width
      )
    : 0

  const fontSize = Math.max(faceWidth * 1.55, faceHeight * 1.18)

  outputContext.save()
  outputContext.translate(centerX, centerY)
  outputContext.rotate(angle)
  outputContext.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
  outputContext.textAlign = 'center'
  outputContext.textBaseline = 'middle'
  outputContext.shadowColor = 'rgba(0, 0, 0, 0.16)'
  outputContext.shadowBlur = Math.max(4, fontSize * 0.035)
  outputContext.fillText(emoji, 0, 0)
  outputContext.restore()
}

export { FACE_EMOJIS }
