export const DEFAULT_AVATAR_STYLE = 'initials'

export const AVATAR_STYLES = [
  { id: 'avataaars', label: 'Avataaars' },
  { id: 'clay', label: 'Clay' },
]

export const AVATAAARS_OPTIONS = {
  top: {
    label: 'Frisyr och huvudbonad',
    values: [
      'bigHair', 'bob', 'bun', 'curly', 'curvy', 'dreads', 'dreads01',
      'dreads02', 'frida', 'frizzle', 'fro', 'froBand', 'hat', 'hijab',
      'longButNotTooLong', 'miaWallace', 'shaggy', 'shaggyMullet',
      'shavedSides', 'shortCurly', 'shortFlat', 'shortRound', 'shortWaved',
      'sides', 'straight01', 'straight02', 'straightAndStrand', 'theCaesar',
      'theCaesarAndSidePart', 'turban', 'winterHat02', 'winterHat03',
      'winterHat04', 'winterHat1',
    ],
  },
  hairColor: {
    label: 'Hårfärg',
    colors: ['a55728', '2c1b18', 'b58143', 'd6b370', '724133', '4a312c', 'f59797', 'ecdcbf', 'c93305', 'e8e1e1'],
  },
  eyes: {
    label: 'Ögon',
    values: ['closed', 'cry', 'default', 'eyeRoll', 'happy', 'hearts', 'side', 'squint', 'surprised', 'wink', 'winkWacky', 'xDizzy'],
  },
  eyebrows: {
    label: 'Ögonbryn',
    values: ['angry', 'angryNatural', 'default', 'defaultNatural', 'flatNatural', 'frownNatural', 'raisedExcited', 'raisedExcitedNatural', 'sadConcerned', 'sadConcernedNatural', 'unibrowNatural', 'upDown', 'upDownNatural'],
  },
  mouth: {
    label: 'Mun',
    values: ['concerned', 'default', 'disbelief', 'eating', 'grimace', 'sad', 'screamOpen', 'serious', 'smile', 'tongue', 'twinkle', 'vomit'],
  },
  clothes: {
    label: 'Kläder',
    values: ['blazerAndShirt', 'blazerAndSweater', 'collarAndSweater', 'graphicShirt', 'hoodie', 'overall', 'shirtCrewNeck', 'shirtScoopNeck', 'shirtVNeck'],
  },
  clothesGraphic: {
    label: 'Klädmotiv',
    values: ['bat', 'bear', 'cumbia', 'deer', 'diamond', 'hola', 'pizza', 'resist', 'skull', 'skullOutline'],
  },
  skinColor: {
    label: 'Hudfärg',
    colors: ['614335', 'd08b5b', 'ae5d29', 'edb98a', 'ffdbb4', 'fd9841', 'f8d25c'],
  },
  accessories: {
    label: 'Accessoarer',
    values: ['kurt', 'prescription01', 'prescription02', 'round', 'sunglasses', 'wayfarers', 'eyepatch'],
  },
  accessoriesColor: {
    label: 'Accessoarfärg',
    colors: ['262e33', '65c9ff', '5199e4', '25557c', 'e6e6e6', '929598', '3c4f5c', 'b1e2ff', 'a7ffc4', 'ffdeb5', 'ffafb9', 'ffffb1', 'ff488e', 'ff5c5c', 'ffffff'],
  },
  facialHair: {
    label: 'Ansiktshår',
    values: ['beardLight', 'beardMajestic', 'beardMedium', 'moustacheFancy', 'moustacheMagnum'],
  },
  facialHairColor: {
    label: 'Färg på ansiktshår',
    colors: ['a55728', '2c1b18', 'b58143', 'd6b370', '724133', '4a312c', 'f59797', 'ecdcbf', 'c93305', 'e8e1e1'],
  },
  clothesColor: {
    label: 'Klädfärg',
    colors: ['262e33', '65c9ff', '5199e4', '25557c', 'e6e6e6', '929598', '3c4f5c', 'b1e2ff', 'a7ffc4', 'ffafb9', 'ffffb1', 'ff488e', 'ff5c5c', 'ffffff'],
  },
  hatColor: {
    label: 'Huvudbonadens färg',
    colors: ['262e33', '65c9ff', '5199e4', '25557c', 'e6e6e6', '929598', '3c4f5c', 'b1e2ff', 'a7ffc4', 'ffdeb5', 'ffafb9', 'ffffb1', 'ff488e', 'ff5c5c', 'ffffff'],
  },
}

export const CLAY_OPTIONS = {
  top: {
    label: 'Frisyr och detaljer',
    values: ['horns', 'nub', 'curl', 'spikes', 'antenna', 'loop', 'peak', 'ears', 'crest', 'swirl', 'pellet', 'hornsSmall', 'tuft'],
  },
  body: {
    label: 'Ansiktsform',
    values: ['pear', 'boulder', 'loaf', 'column', 'stack', 'gumdrop', 'dollop', 'slug', 'egg', 'blob', 'bell', 'cube', 'squat', 'lean'],
  },
  pattern: {
    label: 'Ytdetaljer',
    values: ['spiral', 'prints', 'pellets', 'buttons', 'stitches', 'patch', 'coil', 'freckles', 'checker', 'zig'],
  },
  eyes: {
    label: 'Ögon',
    values: ['googly', 'even', 'big', 'tiny', 'mono', 'trio', 'side', 'outward', 'inward', 'dots', 'happy', 'wink', 'down', 'up', 'pinprick'],
  },
  mouth: {
    label: 'Mun',
    values: ['teeth', 'smile', 'o', 'frown', 'line', 'wavy', 'open', 'toothy', 'tongue', 'pout', 'grin', 'smirk', 'zigzag', 'dot', 'laugh', 'cat', 'smileBig', 'uu', 'openSmall', 'smileTongue'],
  },
  backgroundColor: {
    label: 'Bakgrund',
    colors: ['f4e8d4', 'f8f1e5', 'f7e3d9', 'f9ecc9', 'eff0da', 'e3efe9', 'e2ecf4', 'e9e7f4', 'f4e4ef', 'ece8e2', 'f9e8cf', 'e8edf0'],
  },
  bodyColor: {
    label: 'Ansiktsfärg',
    colors: ['c4795c', 'd99277', 'e0bd6a', 'cf9f52', 'a8b37e', '8ba06b', '83b0a4', '86a5c3', '9793bd', 'ab8bbd', 'cd8ea6', 'b3a696'],
  },
  accentColor: {
    label: 'Accentfärg',
    colors: ['c4795c', 'd99277', 'e0bd6a', 'cf9f52', 'a8b37e', '8ba06b', '83b0a4', '86a5c3', '9793bd', 'ab8bbd', 'cd8ea6', 'b3a696'],
  },
}

export function parseAvatarOptions(value) {
  if (!value) return {}
  if (typeof value === 'object') return value

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

export function getAvatarUrl({ profile, userId, name, size = 96 }) {
  const savedStyle = profile?.avatarStyle
  const style = savedStyle === 'avataaars' || savedStyle === 'clay'
    ? savedStyle
    : DEFAULT_AVATAR_STYLE
  const seed = profile?.avatarSeed || profile?.username || name || userId || 'PLOT TWIST'
  const options = style === 'avataaars'
    ? parseAvatarOptions(profile?.avatarOptions)
    : style === 'clay'
      ? parseAvatarOptions(profile?.avatarOptions)
      : {}
  const parameters = new URLSearchParams({ seed, size: String(size) })

  Object.entries(options).forEach(([key, value]) => {
    if (typeof value === 'string' || typeof value === 'number') {
      parameters.set(key, String(value))
    }
  })

  return `https://api.dicebear.com/10.x/${style}/svg?${parameters.toString()}`
}