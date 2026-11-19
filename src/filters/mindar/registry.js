// Add new MindAR Studio filters here. Each filter reuses the same engine bundle.
// For a new filter, export it from the same MindAR Studio version and copy its
// _x1 file to public/mindar/filters/<assetId>/_x1.
export const MINDAR_FILTERS = [
  {
    id: 'mindar',
    assetId: 'default',
    label: 'Glasögon',
    symbol: '🕶️',
    isNew: true,
  },
]

export function getMindARFilter(cameraFilterId) {
  return MINDAR_FILTERS.find((item) => item.id === cameraFilterId) || null
}

export function isMindARFilter(cameraFilterId) {
  return Boolean(getMindARFilter(cameraFilterId))
}
