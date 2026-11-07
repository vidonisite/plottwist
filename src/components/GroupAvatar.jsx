import ProfileAvatar from './ProfileAvatar.jsx'
import { getAvatarBackgroundColor } from '../lib/avatar.js'

export default function GroupAvatar({
  members = [],
  memberCount = members.length,
  name,
  size = 42,
  className = '',
}) {
  function getMemberMessageTime(member) {
    const time = member.lastMessageAt
      ? new Date(member.lastMessageAt).getTime()
      : Number.NEGATIVE_INFINITY

    return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY
  }

  const orderedMembers = members
    .map((member, index) => ({ member, index }))
    .sort((a, b) => {
      const timeDifference =
        getMemberMessageTime(b.member) - getMemberMessageTime(a.member)
      return (
        (Number.isNaN(timeDifference) ? 0 : timeDifference) ||
        a.index - b.index
      )
    })
    .map(({ member }) => member)
  const visibleMembers = memberCount > 4
    ? orderedMembers.slice(0, 3)
    : orderedMembers
  const layout = memberCount > 4
    ? 'overflow'
    : visibleMembers.length === 1
      ? 'single'
      : visibleMembers.length === 2
        ? 'pair'
        : visibleMembers.length === 3
          ? 'three'
          : 'grid'
  const hiddenMemberCount = Math.max(0, memberCount - 3)
  const avatarSize = layout === 'single' ? size : size / 2
  const wideMember = layout === 'three' ? visibleMembers[2] : null

  return (
    <span
      className={`chat-avatar group-avatar group-avatar--${layout} ${className}`.trim()}
      style={{
        width: size,
        height: size,
      }}
      role="img"
      aria-label={`Gruppbild för ${name || 'gruppen'}`}
    >
      {visibleMembers.map((member) => {
        const backgroundColor =
          getAvatarBackgroundColor(member.avatarProfile) || 'var(--surface-hover)'

        return (
          <span
            key={member.userId}
            className={`group-avatar-tile${
              layout === 'three' && member === wideMember
                ? ' group-avatar-tile--wide'
                : ''
            }`}
            style={{
              backgroundColor,
            }}
          >
            <ProfileAvatar
              profile={member.avatarProfile}
              userId={member.userId}
              name={member.username}
              size={avatarSize}
              className="group-avatar-member"
              backgroundColor={
                layout === 'three' && member === wideMember
                  ? 'transparent'
                  : backgroundColor
              }
            />
          </span>
        )
      })}

      {memberCount > 4 && (
        <span
          className="group-avatar-extra"
          style={{ fontSize: Math.max(8, size / 6) }}
        >
          +{hiddenMemberCount}
        </span>
      )}
    </span>
  )
}
