import { cp, mkdir, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const tasks = [
  {
    source: 'node_modules/@mediapipe/face_mesh',
    destination: 'public/mindar/engine/mediapipe/face_mesh',
    label: 'MediaPipe FaceMesh',
  },
  {
    source: 'node_modules/three/examples/jsm/libs/draco',
    destination: 'public/mindar/engine/draco',
    label: 'Draco decoder',
  },
]

for (const task of tasks) {
  const source = path.join(root, task.source)
  const destination = path.join(root, task.destination)
  try {
    await access(source, constants.R_OK)
  } catch {
    throw new Error(`${task.label} saknas: ${task.source}. Kör npm install först.`)
  }
  await mkdir(path.dirname(destination), { recursive: true })
  await cp(source, destination, { recursive: true, force: true })
  console.log(`Kopierade ${task.label} till ${task.destination}`)
}

console.log('MindAR:s externa modell- och decoder-URL:er ersätts nu av lokala filer.')
