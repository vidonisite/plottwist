
const SCAN_DURATION = 4500
const HOLD_DURATION = 1200

/**
 * Skapar ett Time Warp Scan-filter.
 *
 * Bilden fryses successivt uppifrån och ner.
 * Den frysta delen behåller sina pixlar medan
 * den nedre delen fortsätter visa livekameran.
 */
export function createTimeWarp() {
  let frozenCanvas = null
  let frozenContext = null

  let scanY = 0
  let previousY = 0
  let phase = 'scanning'
  let phaseStartedAt = 0
  let lastFrameTime = 0

  function initialize(width, height) {
    frozenCanvas = document.createElement('canvas')
    frozenCanvas.width = width
    frozenCanvas.height = height

    frozenContext = frozenCanvas.getContext('2d')

    scanY = 0
    previousY = 0
    phase = 'scanning'
    phaseStartedAt = 0
    lastFrameTime = 0
  }

  function reset() {
    if (frozenContext && frozenCanvas) {
      frozenContext.clearRect(
        0,
        0,
        frozenCanvas.width,
        frozenCanvas.height
      )
    }

    scanY = 0
    previousY = 0
    phase = 'scanning'
    phaseStartedAt = 0
  }

  function draw(source, context) {
    if (!source || !context) return

    const width = source.width
    const height = source.height

    if (!width || !height) return

    if (
      !frozenCanvas ||
      frozenCanvas.width !== width ||
      frozenCanvas.height !== height
    ) {
      initialize(width, height)
    }

    const now = performance.now()

    if (!phaseStartedAt) {
      phaseStartedAt = now
      lastFrameTime = now
    }

    const deltaTime = Math.min(now - lastFrameTime, 50)
    lastFrameTime = now

    if (phase === 'scanning') {
      const speed = height / SCAN_DURATION

      scanY = Math.min(
        height,
        scanY + speed * deltaTime
      )

      const currentY = Math.floor(scanY)
      const startY = Math.floor(previousY)
      const stripHeight = currentY - startY

      // Frys den nya bildremsan som linjen har passerat.
      if (stripHeight > 0) {
        frozenContext.drawImage(
          source,
          0,
          startY,
          width,
          stripHeight,
          0,
          startY,
          width,
          stripHeight
        )

        previousY = currentY
      }

      if (scanY >= height) {
        phase = 'holding'
        phaseStartedAt = now
      }
    } else if (phase === 'holding') {
      if (now - phaseStartedAt >= HOLD_DURATION) {
        reset()
        phaseStartedAt = now
      }
    }

    // Börja med den levande kamerabilden.
    context.clearRect(0, 0, width, height)
    context.drawImage(source, 0, 0, width, height)

    // Lägg den frysta bilden ovanpå den övre delen.
    const frozenHeight = phase === 'holding'
      ? height
      : Math.floor(scanY)

    if (frozenHeight > 0) {
      context.save()
      context.beginPath()
      context.rect(0, 0, width, frozenHeight)
      context.clip()

      context.drawImage(
        frozenCanvas,
        0,
        0,
        width,
        height
      )

      context.restore()
    }

    // Rita den lysande scanninglinjen.
    if (phase === 'scanning') {
      const lineY = Math.min(scanY, height - 1)

      context.save()
      context.globalCompositeOperation = 'screen'

      context.shadowColor = '#69EFFF'
      context.shadowBlur = 24
      context.strokeStyle = '#B9F8FF'
      context.lineWidth = 3

      context.beginPath()
      context.moveTo(0, lineY)
      context.lineTo(width, lineY)
      context.stroke()

      // Ett extra tunt, starkt ljus i mitten.
      context.shadowBlur = 10
      context.strokeStyle = '#FFFFFF'
      context.lineWidth = 1

      context.beginPath()
      context.moveTo(0, lineY)
      context.lineTo(width, lineY)
      context.stroke()

      context.restore()
    }
  }

  return {
    draw,
    reset,
  }
}
