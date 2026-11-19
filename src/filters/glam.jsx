import { initOpenMakeupFilter } from '../lib/baseFilter'

export async function startGlam(video, renderCanvas) {
  return initOpenMakeupFilter(video, renderCanvas, 'Glam', async (makeup) => {
    await makeup.apply('foundation', { color: '#eac5ad', finish: 'matte' })
    await makeup.apply('blush', { color: '#ff398b', finish: 'shimmer' })
    await makeup.apply('lipstick', { color: '#ff168f', finish: 'glossy' })
    await makeup.apply('eyeshadow', { color: '#a53cff', finish: 'glitter' })
    await makeup.apply('mascara', { color: '#100b18' })
    await makeup.apply('eyeliner', { color: '#16051e' })

    makeup.morph({
      lipPlump: -1.35,
      lipPlump2: -1.2,
    })
  })
}
