export default function ProfileUsername({
  profile,
  name = '',
  className = '',
}) {
  return (
    <span className={['profile-username', className].filter(Boolean).join(' ')}>
      {name}
    </span>
  )
}
