import { useEffect, useState } from 'react'
import { ArrowLeft, Gamepad2 } from 'lucide-react'
import { Query } from 'appwrite'

import {
  tablesDB,
  DATABASE_ID,
  USERS_TABLE_ID,
  CONTACTS_TABLE_ID,
} from './lib/appwrite.js'
import TicTacToe from './games/tictactoe.jsx'
import './games.css'

const GAME_LIST = [
  {
    id: 'tic-tac-toe',
    name: 'Tic-tac-toe',
    description: 'Tre i rad mot en kompis eller bot.',
  },
]

export default function Games({
  currentUser,
  initialInvite,
  animateIn = false,
  onEntranceAnimationEnd,
  onExit,
}) {
  const [selectedGame, setSelectedGame] = useState(
    initialInvite ? 'tic-tac-toe' : null
  )
  const [friends, setFriends] = useState([])
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [friendsError, setFriendsError] = useState('')

  useEffect(() => {
    if (!currentUser?.$id) return

    let cancelled = false

    async function loadFriends() {
      setLoadingFriends(true)
      setFriendsError('')

      try {
        const contactsResponse = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: CONTACTS_TABLE_ID,
          queries: [
            Query.equal('ownerId', [currentUser.$id]),
            Query.equal('status', ['accepted']),
            Query.limit(500),
          ],
        })
        const contacts = contactsResponse.rows.filter(
          (contact) => contact.contactUserId !== currentUser.$id
        )
        const friendIds = [...new Set(contacts.map((contact) => contact.contactUserId))]
        const profilesResponse = friendIds.length
          ? await tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: USERS_TABLE_ID,
            queries: [
              Query.equal('userId', friendIds),
              Query.limit(500),
            ],
          })
          : { rows: [] }

        if (!cancelled) {
          setFriends(contacts.map((contact) => ({
            userId: contact.contactUserId,
            username:
              profilesResponse.rows.find(
                (profile) => profile.userId === contact.contactUserId
              )?.username ||
              contact.contactUsername ||
              'Okänd användare',
          })))
        }
      } catch (error) {
        console.error('Kunde inte hämta kompisar till spelen:', error)
        if (!cancelled) {
          setFriendsError(
            `Kompislistan kunde inte hämtas: ${error.message || 'Okänt fel'}`
          )
        }
      } finally {
        if (!cancelled) setLoadingFriends(false)
      }
    }

    loadFriends()
    return () => {
      cancelled = true
    }
  }, [currentUser?.$id])

  return (
    <section
      className={`workspace-view games-view ${animateIn ? 'is-entering' : ''}`}
      onAnimationEnd={(event) => {
        if (
          event.target === event.currentTarget &&
          event.animationName === 'games-view-reveal'
        ) {
          onEntranceAnimationEnd?.()
        }
      }}
    >
      <header className="games-header">
        <button
          type="button"
          className="games-back-button"
          onClick={selectedGame ? () => setSelectedGame(null) : onExit}
          aria-label={selectedGame ? 'Tillbaka till spel' : 'Stäng spel'}
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <div>
          <h1>{selectedGame ? 'Tic-tac-toe' : 'Spel'}</h1>
        </div>
      </header>

      {selectedGame ? (
        <TicTacToe
          currentUser={currentUser}
          friends={friends}
          initialInvite={initialInvite}
          loadingFriends={loadingFriends}
          friendsError={friendsError}
          onBack={() => setSelectedGame(null)}
        />
      ) : (
        <div className="game-card-grid">
          {GAME_LIST.map((game) => (
            <button
              type="button"
              key={game.id}
              className="game-card"
              onClick={() => setSelectedGame(game.id)}
            >
              <span className="game-card-preview" aria-hidden="true">
                <span className="tic-tac-toe-preview">
                  <i>×</i><i /><i>○</i>
                  <i /><i>×</i><i />
                  <i>○</i><i /><i>×</i>
                </span>
              </span>
              <span className="game-card-copy">
                <strong>{game.name}</strong>
                <span>{game.description}</span>
              </span>
              <Gamepad2 className="game-card-icon" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
