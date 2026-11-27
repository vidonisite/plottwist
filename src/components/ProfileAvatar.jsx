import { useEffect, useState } from 'react'
import { getAvatarUrl } from '../lib/avatar.js'
import useChristmasCosmetics from '../hooks/useChristmasCosmetics.js'

function getInitials(name = '') {
  const parts = name.trim().split(/[\s_]+/).filter(Boolean)
  return (parts.length > 1
    ? `${parts[0][0]}${parts[1][0]}`
    : parts[0]?.slice(0, 2) || '?'
  ).toUpperCase()
}

export default function ProfileAvatar({
  profile,
  userId,
  name,
  size = 42,
  className = '',
  backgroundColor,
}) {
  const src = getAvatarUrl({ profile, userId, name, size: size * 2 })
  const [failedSrc, setFailedSrc] = useState('')
  const cosmetics = useChristmasCosmetics(profile)

  useEffect(() => {
    setFailedSrc('')
  }, [src])

  const initials = getInitials(profile?.username || name)
  const avatarClassName = [
    'profile-avatar',
    className,
    cosmetics.goldFrame ? 'profile-avatar--christmas-frame' : '',
    cosmetics.santaHat ? 'profile-avatar--christmas-hat' : '',
  ].filter(Boolean).join(' ')

  return (
    <span
      className={avatarClassName}
      style={{
        width: size,
        height: size,
        ...(backgroundColor ? { backgroundColor } : {}),
      }}
      aria-label={name ? `Profilbild för ${name}` : 'Profilbild'}
      role="img"
    >
      {failedSrc === src ? (
        <span aria-hidden="true">{initials}</span>
      ) : (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedSrc(src)}
        />
      )}
      {cosmetics.santaHat && (
        <svg
          className="profile-avatar-seasonal-hat"
          viewBox="0 0 32 26"
          aria-hidden="true"
        >
          <path
            d="M3 19 17 3c1.2-1.4 3.4-.7 3.7 1.1L23 18H3Z"
            fill="#bd263d"
          />
          <path
            d="M3 18h21a3 3 0 0 1 0 6H5a3 3 0 0 1-2-6Z"
            fill="#fffaf3"
          />
          <circle cx="23.5" cy="3.5" r="4" fill="#fffaf3" />
        </svg>
      )}
    </span>
  )
}