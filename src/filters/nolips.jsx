import { initOpenMakeupFilter } from '../lib/baseFilter'

export async function startNoLips(video, renderCanvas) {
  return initOpenMakeupFilter(video, renderCanvas, 'No Lips', async (makeup) => {
    await makeup.apply('foundation', { color: '#eac5ad', finish: 'matte' })
    await makeup.apply('mascara', { color: '#100b18' })

    makeup.morph({
      lipPlump: 1.50,
      lipPlump2: 1.50,
      noseSlim: -1.50,
      cheeks: -1.50,
    })
  })
}
