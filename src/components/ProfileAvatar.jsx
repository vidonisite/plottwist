import { useEffect, useState } from 'react'
import { getAvatarUrl } from '../lib/avatar.js'

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
}) {
  const src = getAvatarUrl({ profile, userId, name, size: size * 2 })
  const [failedSrc, setFailedSrc] = useState('')

  useEffect(() => {
    setFailedSrc('')
  }, [src])

  const initials = getInitials(profile?.username || name)

  return (
    <span
      className={`profile-avatar ${className}`.trim()}
      style={{ width: size, height: size }}
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
    </span>
  )
}