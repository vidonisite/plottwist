
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454,
  323, 361, 288, 397, 365, 379, 378, 400, 377,
  152, 148, 176, 149, 150, 136, 172, 58, 132,
  93, 234, 127, 162, 21, 54, 103, 67, 109
]

const OUTER_LIPS = [
  61, 146, 91, 181, 84, 17, 314, 405, 321,
  375, 291, 308, 324, 318, 402, 317, 14, 87,
  178, 88, 95, 78
]

const INNER_LIPS = [
  78, 191, 80, 81, 82, 13, 312, 311, 310,
  415, 308, 14, 87, 178, 88, 95
]

const LEFT_EYE = [
  33, 160, 158, 133, 153, 144
]

const RIGHT_EYE = [
  362, 385, 387, 263, 373, 380
]

function point(landmarks, index, width, height) {
  const landmark = landmarks[index]

  return {
    x: landmark.x * width,
    y: landmark.y * height
  }
}

function traceShape(ctx, landmarks, indices, width, height) {
  ctx.beginPath()

  indices.forEach((index, i) => {
    const p = point(landmarks, index, width, height)

    if (i === 0) {
      ctx.moveTo(p.x, p.y)
    } else {
      ctx.lineTo(p.x, p.y)
    }
  })

  ctx.closePath()
}

function drawLipGloss(ctx, landmarks, width, height) {
  // Överdrivet rosa läppstift.
  traceShape(ctx, landmarks, OUTER_LIPS, width, height)

  ctx.save()
  ctx.fillStyle = 'rgba(255, 30, 160, 0.96)'
  ctx.shadowColor = 'rgba(255, 90, 180, 0.9)'
  ctx.shadowBlur = width * 0.06
  ctx.fill()
  ctx.restore()

  // Lite mörkare kontur runt läpparna.
  traceShape(ctx, landmarks, OUTER_LIPS, width, height)

  ctx.save()
  ctx.strokeStyle = 'rgba(125, 0, 70, 0.98)'
  ctx.lineWidth = Math.max(2.5, width / 120)
  ctx.stroke()
  ctx.restore()

  // Ljusare färg på insidan för fylligare läppar.
  traceShape(ctx, landmarks, INNER_LIPS, width, height)

  ctx.save()
  ctx.fillStyle = 'rgba(255, 135, 210, 0.9)'
  ctx.shadowColor = 'rgba(255, 170, 220, 0.8)'
  ctx.shadowBlur = width * 0.04
  ctx.fill()
  ctx.restore()

  // Glans på över- och underläppen.
  const upper = point(landmarks, 13, width, height)
  const lower = point(landmarks, 14, width, height)
  const left = point(landmarks, 82, width, height)
  const right = point(landmarks, 312, width, height)

  ctx.save()
  ctx.globalAlpha = 0.95
  ctx.strokeStyle = '#FFF7FF'
  ctx.lineWidth = Math.max(3, width / 75)
  ctx.lineCap = 'round'

  ctx.beginPath()
  ctx.moveTo(left.x + (upper.x - left.x) * 0.25, upper.y - 1)
  ctx.quadraticCurveTo(
    upper.x,
    upper.y - height * 0.012,
    upper.x + (right.x - upper.x) * 0.34,
    upper.y - 1
  )
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(lower.x - width * 0.045, lower.y + height * 0.018)
  ctx.quadraticCurveTo(
    lower.x,
    lower.y + height * 0.028,
    lower.x + width * 0.045,
    lower.y + height * 0.018
  )
  ctx.stroke()
  ctx.restore()
}

function drawEyeshadow(ctx, landmarks, indices, width, height) {
  const eyePoints = indices.map(index =>
    point(landmarks, index, width, height)
  )

  const centerX =
    eyePoints.reduce((sum, p) => sum + p.x, 0) / eyePoints.length
  const centerY =
    eyePoints.reduce((sum, p) => sum + p.y, 0) / eyePoints.length

  const minX = Math.min(...eyePoints.map(p => p.x))
  const maxX = Math.max(...eyePoints.map(p => p.x))
  const minY = Math.min(...eyePoints.map(p => p.y))
  const maxY = Math.max(...eyePoints.map(p => p.y))

  ctx.save()

  const gradient = ctx.createLinearGradient(
    centerX, minY - height * 0.05,
    centerX, maxY + height * 0.03
  )

  gradient.addColorStop(0, 'rgba(255, 35, 180, 0.96)')
  gradient.addColorStop(0.35, 'rgba(203, 72, 255, 0.88)')
  gradient.addColorStop(0.72, 'rgba(130, 32, 255, 0.68)')
  gradient.addColorStop(1, 'rgba(255, 80, 150, 0.18)')

  ctx.fillStyle = gradient
  ctx.shadowColor = 'rgba(255, 92, 195, 0.9)'
  ctx.shadowBlur = width * 0.07
  ctx.beginPath()
  ctx.ellipse(
    centerX,
    centerY - height * 0.02,
    (maxX - minX) * 0.98,
    (maxY - minY) * 2.1,
    0,
    0,
    Math.PI * 2
  )
  ctx.fill()

  // Glittrig eyeliner.
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(55, 0, 70, 0.98)'
  ctx.lineWidth = Math.max(3, width / 85)
  ctx.lineCap = 'round'
  ctx.beginPath()

  eyePoints.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  })

  ctx.stroke()
  ctx.restore()
}

function drawWingedLiner(ctx, landmarks, indices, width, height) {
  const points = indices.map(index =>
    point(landmarks, index, width, height)
  )
  const outer = points[0].x < points[3].x ? points[0] : points[3]
  const eyeCenterX = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const direction = outer.x < eyeCenterX ? -1 : 1
  const wingLength = width * 0.075

  ctx.save()
  ctx.strokeStyle = '#21002B'
  ctx.lineWidth = Math.max(3, width / 90)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(outer.x, outer.y)
  ctx.quadraticCurveTo(
    outer.x + direction * wingLength * 0.45,
    outer.y - height * 0.018,
    outer.x + direction * wingLength,
    outer.y - height * 0.055
  )
  ctx.stroke()
  ctx.restore()
}

function drawLashes(ctx, landmarks, indices, width, height) {
  const points = indices.map(index =>
    point(landmarks, index, width, height)
  )

  ctx.save()
  ctx.strokeStyle = '#16051C'
  ctx.lineWidth = Math.max(2.2, width / 110)
  ctx.lineCap = 'round'

  // Extra långa, överdrivna lösögonfransar.
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const previous = points[Math.max(0, i - 1)]
    const next = points[Math.min(points.length - 1, i + 1)]

    const direction = next.x >= previous.x ? 1 : -1
    const length = height * (0.035 + 0.03 * Math.sin(i * 1.7))

    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.quadraticCurveTo(
      p.x + direction * length * 0.45,
      p.y - length * 0.7,
      p.x + direction * length,
      p.y - length
    )
    ctx.stroke()
  }

  ctx.restore()
}

function drawBlush(ctx, landmarks, width, height) {
  const cheeks = [50, 280]

  ctx.save()

  for (const index of cheeks) {
    const p = point(landmarks, index, width, height)
    const gradient = ctx.createRadialGradient(
      p.x, p.y, 1,
      p.x, p.y, width * 0.13
    )

    gradient.addColorStop(0, 'rgba(255, 45, 145, 0.9)')
    gradient.addColorStop(0.45, 'rgba(255, 70, 170, 0.55)')
    gradient.addColorStop(1, 'rgba(255, 70, 155, 0)')

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.ellipse(
      p.x,
      p.y,
      width * 0.115,
      height * 0.075,
      -0.15,
      0,
      Math.PI * 2
    )
    ctx.fill()
  }

  ctx.restore()
}

function drawHighlighter(ctx, landmarks, width, height) {
  const nose = point(landmarks, 1, width, height)

  ctx.save()
  ctx.fillStyle = 'rgba(255, 245, 255, 0.92)'
  ctx.shadowColor = '#FF9DEF'
  ctx.shadowBlur = width * 0.04

  ctx.beginPath()
  ctx.ellipse(
    nose.x,
    nose.y,
    width * 0.016,
    height * 0.032,
    0,
    0,
    Math.PI * 2
  )
  ctx.fill()

  // Små highlighter-glimtar på kinderna.
  for (const index of [50, 280]) {
    const p = point(landmarks, index, width, height)

    ctx.beginPath()
    ctx.arc(
      p.x + width * 0.03,
      p.y - height * 0.03,
      width * 0.01,
      0,
      Math.PI * 2
    )
    ctx.fill()
  }

  ctx.restore()
}

function drawSparkles(ctx, landmarks, width, height) {
  const anchors = [
    { ...point(landmarks, 33, width, height), xOffset: -1 },
    { ...point(landmarks, 263, width, height), xOffset: 1 },
    { ...point(landmarks, 50, width, height), xOffset: -1 },
    { ...point(landmarks, 280, width, height), xOffset: 1 }
  ]

  ctx.save()
  ctx.fillStyle = '#FFF8FF'
  ctx.strokeStyle = 'rgba(255, 215, 255, 0.95)'
  ctx.shadowColor = '#FF62D4'
  ctx.shadowBlur = width * 0.035

  anchors.forEach((anchor, index) => {
    const x = anchor.x + anchor.xOffset * width * (index < 2 ? 0.045 : 0.035)
    const y = anchor.y - height * (index < 2 ? 0.055 : 0.025)
    const radius = width * (index < 2 ? 0.018 : 0.013)

    ctx.beginPath()
    ctx.moveTo(x, y - radius)
    ctx.lineTo(x + radius * 0.28, y - radius * 0.28)
    ctx.lineTo(x + radius, y)
    ctx.lineTo(x + radius * 0.28, y + radius * 0.28)
    ctx.lineTo(x, y + radius)
    ctx.lineTo(x - radius * 0.28, y + radius * 0.28)
    ctx.lineTo(x - radius, y)
    ctx.lineTo(x - radius * 0.28, y - radius * 0.28)
    ctx.closePath()
    ctx.fill()

    ctx.beginPath()
    ctx.arc(
      x - anchor.xOffset * radius * 1.8,
      y + radius * 1.7,
      radius * 0.22,
      0,
      Math.PI * 2
    )
    ctx.fill()
  })

  ctx.restore()
}

function drawSoftSkin(ctx, sourceCanvas, landmarks, width, height) {
  // Mjukar upp huden försiktigt genom en suddig kopia
  // som begränsas till ansiktets kontur.
  ctx.save()

  traceShape(ctx, landmarks, FACE_OVAL, width, height)
  ctx.clip()

  ctx.globalAlpha = 0.18
  ctx.filter = 'blur(3px)'
  ctx.drawImage(sourceCanvas, 0, 0, width, height)

  ctx.restore()
}

export function drawGlam(sourceCanvas, context, landmarks) {
  const width = sourceCanvas.width
  const height = sourceCanvas.height

  // Visa alltid originalbilden under sminket.
  context.drawImage(sourceCanvas, 0, 0, width, height)

  if (!landmarks || landmarks.length < 400) {
    return
  }

  drawSoftSkin(context, sourceCanvas, landmarks, width, height)

  drawEyeshadow(context, landmarks, LEFT_EYE, width, height)
  drawEyeshadow(context, landmarks, RIGHT_EYE, width, height)

  drawWingedLiner(context, landmarks, LEFT_EYE, width, height)
  drawWingedLiner(context, landmarks, RIGHT_EYE, width, height)

  drawLashes(context, landmarks, LEFT_EYE, width, height)
  drawLashes(context, landmarks, RIGHT_EYE, width, height)

  drawBlush(context, landmarks, width, height)
  drawHighlighter(context, landmarks, width, height)
  drawLipGloss(context, landmarks, width, height)
  drawSparkles(context, landmarks, width, height)
}
