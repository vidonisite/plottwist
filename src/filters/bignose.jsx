import { initOpenMakeupFilter } from '../lib/baseFilter'

export async function startBigNose(video, renderCanvas) {
  return initOpenMakeupFilter(video, renderCanvas, 'Big Nose', async (makeup) => {
    // Vänta in materialen (hanteras i baseFilter, men vi kan anpassa morph direkt)
    makeup.morph({
      noseSlim: 1.50,
      noseBridge: 1.50,
    })
  })
}
