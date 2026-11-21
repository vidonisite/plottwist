
const SCAN_DURATION = 4500
const HOLD_DURATION = 1200
const SWITCH_PAUSE = 180

export function createTimeWarp() {
  let frozenCanvas = null
  let frozenContext = null

  let direction = 'vertical'
  let scanPosition = 0
  let previousPosition = 0
  let phase = 'scanning'
  let phaseStartedAt = 0
  let lastFrameTime = 0
  let startedAt = 0

  function initialize(width, height) {
    frozenCanvas = document.createElement('canvas')
    frozenCanvas.width = width
    frozenCanvas.height = height
    frozenContext = frozenCanvas.getContext('2d')

    scanPosition = 0
    previousPosition = 0
    phase = 'scanning'
    phaseStartedAt = 0
    lastFrameTime = 0
  }

  function clearFrozen() {
    if (frozenContext && frozenCanvas) {
      frozenContext.clearRect(
        0,
        0,
        frozenCanvas.width,
        frozenCanvas.height
      )
    }
  }

  function reset() {
    clearFrozen()
    scanPosition = 0
    previousPosition = 0
    phase = 'scanning'
    phaseStartedAt = 0
    lastFrameTime = performance.now()
  }

  function toggleDirection() {
    direction = direction === 'vertical'
      ? 'horizontal'
      : 'vertical'

    clearFrozen()

    scanPosition = 0
    previousPosition = 0
    phase = 'switching'
    phaseStartedAt = performance.now()
    lastFrameTime = phaseStartedAt
  }

  function drawInstruction(context, width, height, now) {
    if (!startedAt) startedAt = now

    const elapsed = now - startedAt

    if (elapsed >= 1000) return

    let opacity

    if (elapsed < 250) {
      opacity = elapsed / 250
    } else if (elapsed < 700) {
      opacity = 1
    } else {
      opacity = 1 - (elapsed - 700) / 300
    }

    const message = 'KLICKA FÖR ATT BYTA RIKTNING'

    context.save()
    context.globalAlpha = Math.max(0, Math.min(1, opacity))

    const fontSize = Math.max(13, Math.min(20, width * 0.045))
    context.font = `700 ${fontSize}px Arial`
    context.textAlign = 'center'
    context.textBaseline = 'middle'

    const centerX = width / 2
    const centerY = height / 2
    const textWidth = context.measureText(message).width
    const paddingX = 18
    const paddingY = 12

    context.fillStyle = 'rgba(0, 0, 0, 0.48)'
    context.beginPath()
    context.roundRect(
      centerX - textWidth / 2 - paddingX,
      centerY - fontSize / 2 - paddingY,
      textWidth + paddingX * 2,
      fontSize + paddingY * 2,
      12
    )
    context.fill()

    context.fillStyle = '#FFFFFF'
    context.shadowColor = 'rgba(0, 0, 0, 0.6)'
    context.shadowBlur = 8
    context.fillText(message, centerX, centerY)

    context.restore()
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

    if (!startedAt) startedAt = now

    if (phase === 'switching') {
      if (now - phaseStartedAt >= SWITCH_PAUSE) {
        phase = 'scanning'
        phaseStartedAt = now
        lastFrameTime = now
      }
    } else {
      const deltaTime = Math.min(now - lastFrameTime, 50)
      lastFrameTime = now

      if (phase === 'scanning') {
        const dimension = direction === 'vertical'
          ? height
          : width

        const speed = dimension / SCAN_DURATION

        scanPosition = Math.min(
          dimension,
          scanPosition + speed * deltaTime
        )

        const currentPosition = Math.floor(scanPosition)
        const startPosition = Math.floor(previousPosition)
        const stripSize = currentPosition - startPosition

        if (stripSize > 0) {
          if (direction === 'vertical') {
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

        if (scanPosition >= dimension) {
          phase = 'holding'
          phaseStartedAt = now
        }
      } else if (phase === 'holding') {
        if (now - phaseStartedAt >= HOLD_DURATION) {
          reset()
        }
      }
    }

    context.clearRect(0, 0, width, height)
    context.drawImage(source, 0, 0, width, height)

    const frozenSize = direction === 'vertical'
      ? height
      : width

    const visibleFrozenSize = phase === 'holding'
      ? frozenSize
      : Math.floor(scanPosition)

    if (visibleFrozenSize > 0) {
      context.save()
      context.beginPath()

      if (direction === 'vertical') {
        context.rect(0, 0, width, visibleFrozenSize)
      } else {
        context.rect(0, 0, visibleFrozenSize, height)
      }

      context.clip()
      context.drawImage(frozenCanvas, 0, 0, width, height)
      context.restore()
    }

    if (phase === 'scanning') {
      const isVertical = direction === 'vertical'

      const linePosition = Math.min(
        scanPosition,
        (isVertical ? height : width) - 1
      )

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

    drawInstruction(context, width, height, now)
  }

  return {
    draw,
    reset,
    toggleDirection,
  }
}
