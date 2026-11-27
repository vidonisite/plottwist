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
  backgroundColor,
}) {
  const src = getAvatarUrl({ profile, userId, name, size: size * 2 })
  const [failedSrc, setFailedSrc] = useState('')

  useEffect(() => {
    setFailedSrc('')
  }, [src])

  const initials = getInitials(profile?.username || name)
  const avatarClassName = [
    'profile-avatar',
    className,
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
    </span>
  )
}