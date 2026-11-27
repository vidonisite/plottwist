const RAINBOW_COLORS = [
  '#ff4d6d',
  '#ff914d',
  '#ffd84d',
  '#73df78',
  '#4dc9ff',
  '#8b72ff',
  '#ec72d4',
]

const MOUTH_OPEN_RATIO = 0.16
const MIN_MOUTH_GAP = 5
const PARTICLES_PER_SECOND = 105
const PARTICLE_LIFETIME = 0.72
const MAX_PARTICLES = 220

function getPoint(landmarks, index) {
  const point = landmarks[index]
  return point && Number.isFinite(point.x) && Number.isFinite(point.y)
    ? point
    : null
}

export function createRainbowMouth() {
  let particles = []
  let lastFrameTime = 0
  let emissionRemainder = 0

  return function drawRainbowMouth(source, outputContext, landmarks) {
    if (!source || !outputContext) return

    const width = source.width || source.videoWidth
    const height = source.height || source.videoHeight
    if (!width || !height) return

    const now = performance.now()
    const deltaTime = lastFrameTime
      ? Math.min((now - lastFrameTime) / 1000, 0.05)
      : 0
    lastFrameTime = now

    outputContext.clearRect(0, 0, width, height)
    outputContext.drawImage(source, 0, 0, width, height)

    const upperLip = getPoint(landmarks, 13)
    const lowerLip = getPoint(landmarks, 14)
    const leftCorner = getPoint(landmarks, 61)
    const rightCorner = getPoint(landmarks, 291)
    let emitter = null

    if (upperLip && lowerLip && leftCorner && rightCorner) {
      const mouthWidth = Math.hypot(
        (rightCorner.x - leftCorner.x) * width,
        (rightCorner.y - leftCorner.y) * height
      )
      const mouthGap = Math.abs(lowerLip.y - upperLip.y) * height

      if (
        mouthWidth > 0 &&
        mouthGap > Math.max(MIN_MOUTH_GAP, mouthWidth * MOUTH_OPEN_RATIO)
      ) {
        emitter = {
          x: (1 - (upperLip.x + lowerLip.x) / 2) * width,
          y: ((upperLip.y + lowerLip.y) / 2) * height,
          spread: Math.max(5, mouthWidth * 0.22),
        }
      }
    }

    if (emitter) {
      emissionRemainder += deltaTime * PARTICLES_PER_SECOND
      const count = Math.floor(emissionRemainder)
      emissionRemainder -= count

      for (let index = 0; index < count; index++) {
        particles.push({
          x: emitter.x + (Math.random() - 0.5) * emitter.spread,
          y: emitter.y,
          velocityX: (Math.random() - 0.5) * 32,
          velocityY: 45 + Math.random() * 65,
          phase: Math.random() * Math.PI * 2,
          size: 2.5 + Math.random() * 3.5,
          age: 0,
          born: true,
          color: RAINBOW_COLORS[
            Math.floor(Math.random() * RAINBOW_COLORS.length)
          ],
        })
      }
    } else {
      emissionRemainder = 0
    }

    outputContext.save()
    outputContext.globalCompositeOperation = 'source-over'

    particles = particles.filter((particle) => {
      let horizontalVelocity = particle.velocityX

      if (particle.born) {
        particle.born = false
      } else {
        particle.age += deltaTime
        if (particle.age >= PARTICLE_LIFETIME) return false

        const progress = particle.age / PARTICLE_LIFETIME
        const windStrength = progress * progress
        const wind = (
          Math.sin(now * 0.0016 + particle.age * 5) * 105 +
          Math.sin(now * 0.0024 + particle.age * 8 + particle.phase) * 48
        ) * windStrength
        horizontalVelocity = particle.velocityX + wind

        particle.x += horizontalVelocity * deltaTime
        particle.y += particle.velocityY * deltaTime
      }

      const progress = particle.age / PARTICLE_LIFETIME

      outputContext.globalAlpha = 0.82 * (1 - progress * 0.45)
      outputContext.fillStyle = particle.color
      outputContext.shadowColor = particle.color
      outputContext.shadowBlur = 9
      outputContext.beginPath()
      outputContext.ellipse(
        particle.x,
        particle.y,
        particle.size * (1 - progress * 0.25),
        particle.size * 1.35,
        Math.atan2(particle.velocityY, horizontalVelocity) - Math.PI / 2,
        0,
        Math.PI * 2
      )
      outputContext.fill()
      return true
    })

    if (particles.length > MAX_PARTICLES) {
      particles = particles.slice(-MAX_PARTICLES)
    }

    outputContext.restore()
  }
}
