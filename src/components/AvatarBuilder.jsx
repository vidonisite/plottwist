import { useEffect, useState } from 'react'
import {
  AVATAR_STYLES,
  AVATAAARS_OPTIONS,
  CLAY_OPTIONS,
  getAvatarUrl,
  parseAvatarOptions,
} from '../lib/avatar.js'
import ProfileAvatar from './ProfileAvatar.jsx'
import './AvatarBuilder.css'

const HEADWEAR = new Set([
  'hat', 'hijab', 'turban', 'winterHat02', 'winterHat03', 'winterHat04', 'winterHat1',
])

function field(key, catalog, values) {
  return {
    key,
    ...catalog[key],
    ...(values ? { values } : {}),
  }
}

const AVATAR_CATEGORIES = {
  avataaars: [
    {
      id: 'hair',
      label: 'Hår',
      fields: [
        field('top', AVATAAARS_OPTIONS, AVATAAARS_OPTIONS.top.values.filter((value) => !HEADWEAR.has(value))),
        field('hairColor', AVATAAARS_OPTIONS),
      ],
    },
    {
      id: 'clothes',
      label: 'Kläder',
      fields: [field('clothes', AVATAAARS_OPTIONS), field('clothesGraphic', AVATAAARS_OPTIONS), field('clothesColor', AVATAAARS_OPTIONS)],
    },
    {
      id: 'face',
      label: 'Ansikte',
      fields: [field('skinColor', AVATAAARS_OPTIONS), field('eyes', AVATAAARS_OPTIONS), field('eyebrows', AVATAAARS_OPTIONS), field('mouth', AVATAAARS_OPTIONS)],
    },
    {
      id: 'headwear',
      label: 'Huvudbonader',
      fields: [
        field('top', AVATAAARS_OPTIONS, AVATAAARS_OPTIONS.top.values.filter((value) => HEADWEAR.has(value))),
        field('hatColor', AVATAAARS_OPTIONS),
      ],
    },
    {
      id: 'accessories',
      label: 'Accessoarer',
      fields: [field('accessories', AVATAAARS_OPTIONS), field('accessoriesColor', AVATAAARS_OPTIONS)],
    },
    {
      id: 'facial-hair',
      label: 'Ansiktshår',
      fields: [field('facialHair', AVATAAARS_OPTIONS), field('facialHairColor', AVATAAARS_OPTIONS)],
    },
  ],
  clay: [
    { id: 'shape', label: 'Form', fields: [field('body', CLAY_OPTIONS), field('bodyColor', CLAY_OPTIONS)] },
    { id: 'details', label: 'Detaljer', fields: [field('top', CLAY_OPTIONS), field('pattern', CLAY_OPTIONS)] },
    { id: 'face', label: 'Ansikte', fields: [field('eyes', CLAY_OPTIONS), field('mouth', CLAY_OPTIONS)] },
    { id: 'colors', label: 'Färger', fields: [field('backgroundColor', CLAY_OPTIONS), field('accentColor', CLAY_OPTIONS)] },
  ],
}

function createSeed() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function AvatarOption({ field, options, previewProfile, userId, name, onChange }) {
  const choices = field.values || field.colors || []
  const isColorField = Boolean(field.colors)

  function getChoiceUrl(value) {
    const avatarOptions = { ...options }
    if (value) avatarOptions[field.key] = value
    else delete avatarOptions[field.key]

    const previewDefaults = {
      hairColor: { top: 'bigHair' },
      hatColor: { top: 'hat' },
      clothesGraphic: { clothes: 'graphicShirt' },
      clothesColor: { clothes: 'hoodie' },
      accessoriesColor: { accessories: 'round' },
      facialHairColor: { facialHair: 'beardLight' },
      accentColor: { top: 'curl' },
    }

    Object.entries(previewDefaults[field.key] || {}).forEach(([key, fallback]) => {
      if (
        !avatarOptions[key] ||
        (field.key === 'hatColor' && !HEADWEAR.has(avatarOptions.top)) ||
        field.key === 'accentColor'
      ) {
        avatarOptions[key] = fallback
      }
    })

    return getAvatarUrl({
      profile: { ...previewProfile, avatarOptions },
      userId,
      name,
      size: 96,
    })
  }

  return (
    <section className="avatar-choice-group" aria-label={field.label}>
      <h3>{field.label}</h3>
      <div className="avatar-choice-grid">
        <button
          type="button"
          className={`avatar-choice ${!options[field.key] ? 'selected' : ''}`}
          aria-label={`Slumpa ${field.label.toLowerCase()}`}
          aria-pressed={!options[field.key]}
          onClick={() => onChange(field.key, '')}
        >
          <img src={getChoiceUrl('')} alt="" loading="lazy" />
          <span>Slumpa</span>
        </button>
        {choices.map((choice) => {
          const selected = options[field.key] === choice
          const label = isColorField
            ? `${field.label}, ${choice}`
            : choice.replace(/([a-z])([A-Z])/g, '$1 $2')

          return (
            <button
              type="button"
              key={choice}
              className={`avatar-choice ${selected ? 'selected' : ''}`}
              aria-label={label}
              aria-pressed={selected}
              title={label}
              onClick={() => onChange(field.key, selected ? '' : choice)}
            >
              <img src={getChoiceUrl(choice)} alt="" loading="lazy" />
              {isColorField && (
                <span
                  className="avatar-choice-swatch"
                  style={{ backgroundColor: `#${choice}` }}
                />
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default function AvatarBuilder({ profile, userId, name, onSaved }) {
  const [style, setStyle] = useState(profile?.avatarStyle || 'initials')
  const [seed, setSeed] = useState(profile?.avatarSeed || profile?.username || userId || 'PLOT TWIST')
  const [options, setOptions] = useState(parseAvatarOptions(profile?.avatarOptions))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [activeCategory, setActiveCategory] = useState('')

  useEffect(() => {
    setStyle(profile?.avatarStyle || 'initials')
    setSeed(profile?.avatarSeed || profile?.username || userId || 'PLOT TWIST')
    setOptions(parseAvatarOptions(profile?.avatarOptions))
    setActiveCategory(AVATAR_CATEGORIES[profile?.avatarStyle]?.[0]?.id || '')
  }, [profile, userId])

  const previewProfile = {
    ...profile,
    avatarStyle: style,
    avatarSeed: seed,
    avatarOptions: options,
  }
  const categories = AVATAR_CATEGORIES[style] || []
  const selectedCategory = categories.find((category) => category.id === activeCategory)

  function chooseStyle(nextStyle) {
    setStyle(nextStyle)
    setOptions({})
    setActiveCategory(AVATAR_CATEGORIES[nextStyle]?.[0]?.id || '')
    setMessage('')
  }

  function updateOption(key, value) {
    setOptions((previous) => {
      const next = { ...previous }
      if (value) next[key] = value
      else delete next[key]

      const requiredBaseOptions = {
        clothesGraphic: { clothes: 'graphicShirt' },
        hatColor: { top: 'hat' },
        accessoriesColor: { accessories: 'round' },
        facialHairColor: { facialHair: 'beardLight' },
        accentColor: { top: 'curl' },
      }

      if (value) {
        Object.entries(requiredBaseOptions[key] || {}).forEach(([baseKey, fallback]) => {
          if (!next[baseKey] || (key === 'hatColor' && !HEADWEAR.has(next.top))) {
            next[baseKey] = fallback
          }
        })
      }

      return next
    })
  }

  function resetAvatar() {
    setStyle('initials')
    setSeed(profile?.username || userId || 'PLOT TWIST')
    setOptions({})
    setMessage('')
  }

  function randomizeAvatar() {
    setSeed(createSeed())
    setOptions({})
    setMessage('')
  }

  async function saveAvatar() {
    if (!profile?.$id || saving) return

    setSaving(true)
    setMessage('')

    try {
      const updatedProfile = await onSaved({
        avatarStyle: style,
        avatarSeed: seed,
        avatarOptions: JSON.stringify(options),
      })
      setMessage(updatedProfile ? 'Profilbilden är sparad.' : 'Profilbilden kunde inte sparas.')
    } catch (error) {
      setMessage(error.message || 'Profilbilden kunde inte sparas.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="avatar-builder" aria-labelledby="avatar-builder-title">
      <div className="avatar-builder-sticky">
        <div className="avatar-builder-heading">
          <div>
            <p className="avatar-builder-eyebrow">DIN PROFIL</p>
            <h2 id="avatar-builder-title">Profilbild / Avatar</h2>
          </div>
          <ProfileAvatar
            profile={previewProfile}
            userId={userId}
            name={name}
            size={88}
            className="avatar-builder-preview"
          />
        </div>

        <div className="avatar-style-picker" aria-label="Välj avatarstil">
          {AVATAR_STYLES.map((item) => (
            <button
              type="button"
              key={item.id}
              className={style === item.id ? 'selected' : ''}
              aria-pressed={style === item.id}
              onClick={() => chooseStyle(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {categories.length > 0 && (
          <div className="avatar-category-tabs" role="tablist" aria-label="Avatarens kategorier">
            {categories.map((category) => (
              <button
                type="button"
                key={category.id}
                role="tab"
                aria-selected={activeCategory === category.id}
                className={activeCategory === category.id ? 'selected' : ''}
                onClick={() => setActiveCategory((active) => active === category.id ? '' : category.id)}
              >
                {category.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {style === 'avataaars' || style === 'clay' ? (
        <div className="avatar-category-content" role="tabpanel">
          {selectedCategory?.fields.map((optionField) => (
            <AvatarOption
              key={optionField.key}
              field={optionField}
              options={options}
              previewProfile={previewProfile}
              userId={userId}
              name={name}
              onChange={updateOption}
            />
          ))}
        </div>
      ) : (
        <p className="avatar-builder-message">
          Välj Avataaars eller Clay för att börja skapa din avatar.
        </p>
      )}

      {message && <p className="avatar-builder-message" role="status">{message}</p>}

      <div className="avatar-builder-actions">
        <button type="button" className="avatar-secondary-action" onClick={resetAvatar}>
          Återställ
        </button>
        <button type="button" className="avatar-secondary-action" onClick={randomizeAvatar}>
          Slumpa
        </button>
        <button
          type="button"
          className="avatar-save-action"
          onClick={saveAvatar}
          disabled={!profile?.$id || saving}
        >
          {saving ? 'Sparar...' : 'Spara avatar'}
        </button>
      </div>
    </section>
  )
}