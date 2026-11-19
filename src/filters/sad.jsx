import { initOpenMakeupFilter } from '../lib/baseFilter'

export async function startSad(video, renderCanvas) {
  return initOpenMakeupFilter(video, renderCanvas, 'Sad', async (makeup) => {

    makeup.morph({
      'facemesh9.001': 1.50, // Citattecken gör att koden kan byggas utan syntaxfel
    })
  })
}
