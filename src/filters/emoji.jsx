
const FACE_EMOJIS = ['😍', '😊', '😜', '😭', '😩', '❤️', '😂']

/**
 * Ritar en 2D-emoji över ansiktet.
 *
 * FaceLandmarker analyserar den ospegelvända videon,
 * medan sourceCanvas redan är spegelvänd.
 *
 * Därför spegelvänder vi ansiktslandmärkenas X-koordinater
 * innan vi beräknar position och rotation.
 */
export function drawFaceEmoji(source, outputContext, landmarks, emoji = '😍') {
  if (!source || !outputContext) return

  const width = source.width || source.videoWidth
  const height = source.height || source.videoHeight

  if (!width || !height) return

  outputContext.clearRect(0, 0, width, height)
  outputContext.drawImage(source, 0, 0, width, height)

  if (!landmarks?.length) return

  // Spegelvänd alla X-koordinater så att de matchar kamerabilden.
  const mirroredLandmarks = landmarks.map((point) => ({
    x: 1 - point.x,
    y: point.y,
  }))

  let minX = 1
  let maxX = 0
  let minY = 1
  let maxY = 0

  for (const point of mirroredLandmarks) {
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

  // Ögonens positioner är nu också spegelvända.
  const leftEye = mirroredLandmarks[33]
  const rightEye = mirroredLandmarks[263]

  // Beräkna rotationen direkt från den spegelvända bilden.
  const angle = leftEye && rightEye
    ? Math.atan2(
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
