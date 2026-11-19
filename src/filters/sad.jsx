import { initOpenMakeupFilter } from '../lib/baseFilter'

export async function startSad(video, renderCanvas) {
  return initOpenMakeupFilter(video, renderCanvas, 'Sad', async (makeup) => {
    await makeup.apply('foundation', { color: '#eac5ad', finish: 'matte' })
    await makeup.apply('mascara', { color: '#100b18' })

    makeup.morph({
      'facemesh9.001': 1.50, // Citattecken gör att koden kan byggas utan syntaxfel
    })
  })
}
