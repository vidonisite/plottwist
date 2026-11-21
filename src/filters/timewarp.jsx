
const SCAN_DURATION = 4500
const HOLD_DURATION = 4000

/**
 * Time Warp Scan.
 * Växlar mellan vertikal scanning (uppifrån och ner)
 * och horisontell scanning (från vänster till höger).
 */
export function createTimeWarp() {
  let frozenCanvas = null
  let frozenContext = null

  let direction = 'vertical'
  let scanPosition = 0
  let previousPosition = 0
  let phase = 'scanning'
  let phaseStartedAt = 0
  let lastFrameTime = 0

  function initialize(width, height) {
    frozenCanvas = document.createElement('canvas')
    frozenCanvas.width = width
    frozenCanvas.height = height
    frozenContext = frozenCanvas.getContext('2d')

    reset()
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

    scanPosition = 0
    previousPosition = 0
    phase = 'scanning'
    phaseStartedAt = 0
    lastFrameTime = 0
  }

  function toggleDirection() {
    direction = direction === 'vertical'
      ? 'horizontal'
      : 'vertical'

    reset()
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

    const isVertical = direction === 'vertical'
    const scanLength = isVertical ? height : width
    const now = performance.now()

    if (!phaseStartedAt) {
      phaseStartedAt = now
      lastFrameTime = now
    }

    const deltaTime = Math.min(now - lastFrameTime, 50)
    lastFrameTime = now

    if (phase === 'scanning') {
      const speed = scanLength / SCAN_DURATION

      scanPosition = Math.min(
        scanLength,
        scanPosition + speed * deltaTime
      )

      const currentPosition = Math.floor(scanPosition)
      const startPosition = Math.floor(previousPosition)
      const stripSize = currentPosition - startPosition

      // Frys bildremsan som linjen just har passerat.
      if (stripSize > 0) {
        if (isVertical) {
          frozenContext.drawImage(
            source,
            0,
            startPosition,
            width,
            stripSize,
            0,
            startPosition,
            width,
            stripSize
          )
        } else {
          frozenContext.drawImage(
            source,
            startPosition,
            0,
            stripSize,
            height,
            startPosition,
            0,
            stripSize,
            height
          )
        }

        previousPosition = currentPosition
      }

      if (scanPosition >= scanLength) {
        phase = 'holding'
        phaseStartedAt = now
      }
    } else if (phase === 'holding') {
      if (now - phaseStartedAt >= HOLD_DURATION) {
        reset()
      }
    }

    // Rita den levande kamerabilden först.
    context.clearRect(0, 0, width, height)
    context.drawImage(source, 0, 0, width, height)

    // Lägg den frysta delen ovanpå kamerabilden.
    const frozenSize = phase === 'holding'
      ? scanLength
      : Math.floor(scanPosition)

    if (frozenSize > 0) {
      context.save()
      context.beginPath()

      if (isVertical) {
        context.rect(0, 0, width, frozenSize)
      } else {
        context.rect(0, 0, frozenSize, height)
      }

      context.clip()
      context.drawImage(frozenCanvas, 0, 0, width, height)
      context.restore()
    }

    // Rita scanninglinjen.
    if (phase === 'scanning') {
      const linePosition = Math.min(scanPosition, scanLength - 1)

      context.save()
      context.globalCompositeOperation = 'screen'

      context.shadowColor = '#69EFFF'
      context.shadowBlur = 24
      context.strokeStyle = '#B9F8FF'
      context.lineWidth = 3

      context.beginPath()

      if (isVertical) {
        context.moveTo(0, linePosition)
        context.lineTo(width, linePosition)
      } else {
        context.moveTo(linePosition, 0)
        context.lineTo(linePosition, height)
      }

      context.stroke()

      context.shadowBlur = 10
      context.strokeStyle = '#FFFFFF'
      context.lineWidth = 1

      context.beginPath()

      if (isVertical) {
        context.moveTo(0, linePosition)
        context.lineTo(width, linePosition)
      } else {
        context.moveTo(linePosition, 0)
        context.lineTo(linePosition, height)
      }

      context.stroke()
      context.restore()
    }
  }

  return {
    draw,
    reset,
    toggleDirection,
  }
}
