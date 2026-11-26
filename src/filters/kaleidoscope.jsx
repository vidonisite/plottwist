export function drawKaleidoscope(source, context) {
  if (!source || !context) return

  const width = source.width
  const height = source.height
  if (!width || !height) return

  const halfWidth = width / 2
  context.clearRect(0, 0, width, height)
  context.drawImage(
    source,
    0, 0, halfWidth, height,
    0, 0, halfWidth, height
  )

  context.save()
  context.translate(width, 0)
  context.scale(-1, 1)
  context.drawImage(
    source,
    0, 0, halfWidth, height,
    0, 0, halfWidth, height
  )
  context.restore()
}
