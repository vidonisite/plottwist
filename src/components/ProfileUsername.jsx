import useChristmasCosmetics from '../hooks/useChristmasCosmetics.js'

import './ProfileUsername.css'

export default function ProfileUsername({
  profile,
  name = '',
  className = '',
}) {
  const isHollyName = useChristmasCosmetics(profile).hollyName
  const classes = [
    'profile-username',
    isHollyName ? 'profile-username--holly' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <span className={classes}>
      {isHollyName
        ? Array.from(name).map((character, index) => (
          <span
            className={index % 2 === 0 ? 'is-holly-red' : 'is-holly-green'}
            key={`${index}-${character}`}
          >
            {character}
          </span>
        ))
        : name}
    </span>
  )
}
