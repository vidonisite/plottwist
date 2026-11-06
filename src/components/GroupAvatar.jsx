import ProfileAvatar from './ProfileAvatar.jsx'

export default function GroupAvatar({
  members = [],
  memberCount = members.length,
  name,
  size = 42,
  className = '',
}) {
  const visibleMembers = members.slice(0, 5)
  const layout = visibleMembers.length === 3
    ? 'three'
    : visibleMembers.length >= 4
      ? 'stacked'
      : 'pair'
  const extraMembers = Math.max(0, memberCount - 5)
  const avatarSize = size <= 42 ? 26 : 34

  return (
    <span
      className={`chat-avatar group-avatar group-avatar--${size <= 42 ? 'compact' : 'large'} ${className}`.trim()}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Gruppbild för ${name || 'gruppen'}`}
    >
      {visibleMembers.map((member, index) => {
        const row = layout === 'stacked' && index < 2 ? 'rear' : 'front'
        const positionIndex = layout === 'stacked' && index >= 2
          ? index - 2
          : index

        return (
          <ProfileAvatar
            key={member.userId || index}
            profile={member.avatarProfile}
            userId={member.userId}
            name={member.username}
            size={avatarSize}
            className={`group-avatar-member group-avatar-member--${layout} group-avatar-member--${row} group-avatar-member--position-${positionIndex}`}
          />
        )
      })}

      {extraMembers > 0 && (
        <span className="group-avatar-extra" aria-hidden="true">
          +{extraMembers}
        </span>
      )}
    </span>
  )
}
