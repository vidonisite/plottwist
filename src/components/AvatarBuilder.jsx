import { useEffect, useState } from 'react'
import { AVATAR_STYLES, AVATAAARS_OPTIONS, CLAY_OPTIONS, parseAvatarOptions } from '../lib/avatar.js'
import ProfileAvatar from './ProfileAvatar.jsx'
import './AvatarBuilder.css'

function createSeed() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function AvatarOption({ name, option, value, onChange }) {
  if (option.colors) {
    return (
      <div className="avatar-color-field">
        <span>{option.label}</span>
        <div className="avatar-color-picker" aria-label={option.label}>
          {option.colors.map((color) => (
            <button
              type="button"
              key={color}
              aria-label={`${option.label}: ${color}`}
              aria-pressed={value === color}
              className={value === color ? 'selected' : ''}
              style={{ '--swatch': `#${color}` }}
              onClick={() => onChange(name, value === color ? '' : color)}
            />
          ))}
          <button
            type="button"
            className="avatar-color-random"
            aria-label={`Slumpa ${option.label.toLowerCase()}`}
            aria-pressed={!value}
            onClick={() => onChange(name, '')}
          >
            ×
          </button>
        </div>
      </div>
    )
  }

  return (
    <label>
      <span>{option.label}</span>
      <select value={value || ''} onChange={(event) => onChange(name, event.target.value)}>
        <option value="">Slumpa</option>
        {option.values.map((item) => (
          <option value={item} key={item}>
            {item.replace(/([a-z])([A-Z])/g, '$1 $2')}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function AvatarBuilder({ profile, userId, name, onSaved }) {
  const [style, setStyle] = useState(profile?.avatarStyle || 'initials')
  const [seed, setSeed] = useState(profile?.avatarSeed || profile?.username || userId || 'PLOT TWIST')
  const [options, setOptions] = useState(parseAvatarOptions(profile?.avatarOptions))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setStyle(profile?.avatarStyle || 'initials')
    setSeed(profile?.avatarSeed || profile?.username || userId || 'PLOT TWIST')
    setOptions(parseAvatarOptions(profile?.avatarOptions))
  }, [profile, userId])

  const previewProfile = {
    ...profile,
    avatarStyle: style,
    avatarSeed: seed,
    avatarOptions: options,
  }

  function chooseStyle(nextStyle) {
    setStyle(nextStyle)
    setOptions({})
    setMessage('')
  }

  function updateOption(key, value) {
    setOptions((previous) => {
      const next = { ...previous }
      if (value) next[key] = value
      else delete next[key]
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

      {style === 'avataaars' || style === 'clay' ? (
        <div className="avatar-options-grid">
          {Object.entries(style === 'clay' ? CLAY_OPTIONS : AVATAAARS_OPTIONS).map(([key, field]) => (
            <AvatarOption
              key={key}
              name={key}
              option={field}
              value={options[key]}
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