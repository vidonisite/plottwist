import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Gamepad2 } from 'lucide-react'
import { ID, Permission, Query, Role } from 'appwrite'

import {
  client,
  tablesDB,
  DATABASE_ID,
  CONVERSATIONS_TABLE_ID,
  CONVERSATION_MEMBERS_TABLE_ID,
  MESSAGES_TABLE_ID,
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
    minPlayers: 2,
    maxPlayers: 2,
    Component: TicTacToe,
  },
]

async function stableId(value) {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

async function ensureDirectConversation(userAId, userBId) {
  const directKey = [userAId, userBId].sort().join(':')
  const conversationId = await stableId(`direct:${directKey}`)
  let conversation

  try {
    conversation = await tablesDB.getRow({
      databaseId: DATABASE_ID,
      tableId: CONVERSATIONS_TABLE_ID,
      rowId: conversationId,
    })
  } catch (error) {
    if (error.code !== 404) throw error

    try {
      conversation = await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: CONVERSATIONS_TABLE_ID,
        rowId: conversationId,
        data: {
          type: 'direct',
          name: 'Privat chatt',
          createdBy: userAId,
          directKey,
        },
        permissions: [
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users()),
        ],
      })
    } catch (createError) {
      try {
        conversation = await tablesDB.getRow({
          databaseId: DATABASE_ID,
          tableId: CONVERSATIONS_TABLE_ID,
          rowId: conversationId,
        })
      } catch {
        throw createError
      }
    }
  }

  if (conversation.type !== 'direct' || conversation.directKey !== directKey) {
    throw new Error('Den privata konversationen kunde inte verifieras.')
  }

  for (const userId of [userAId, userBId]) {
    const memberId = await stableId(`member:${conversation.$id}:${userId}`)
    try {
      await tablesDB.getRow({
        databaseId: DATABASE_ID,
        tableId: CONVERSATION_MEMBERS_TABLE_ID,
        rowId: memberId,
      })
    } catch (error) {
      if (error.code !== 404) throw error

      try {
        await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: CONVERSATION_MEMBERS_TABLE_ID,
          rowId: memberId,
          data: { userId, conversationId: conversation.$id },
          permissions: [
            Permission.read(Role.users()),
            Permission.update(Role.user(userId)),
          ],
        })
      } catch (createError) {
        try {
          await tablesDB.getRow({
            databaseId: DATABASE_ID,
            tableId: CONVERSATION_MEMBERS_TABLE_ID,
            rowId: memberId,
          })
        } catch {
          throw createError
        }
      }
    }
  }

  return conversation
}

function readMessage(message) {
  try {
    return JSON.parse(message.text)
  } catch (error) {
    console.error('Ogiltigt spelmeddelande:', error)
    return null
  }
}

export default function Games({
  currentUser,
  initialInvite,
  animateIn = false,
  onEntranceAnimationEnd,
  onExit,
}) {
  const [selectedGameId, setSelectedGameId] = useState(
    initialInvite?.gameId || (initialInvite ? 'tic-tac-toe' : null)
  )
  const [friends, setFriends] = useState([])
  const [loadingFriends, setLoadingFriends] = useState(false)
  const [friendsError, setFriendsError] = useState('')
  const [inviteGameId, setInviteGameId] = useState(null)
  const [selectedFriendIds, setSelectedFriendIds] = useState([])
  const [inviteLobby, setInviteLobby] = useState(null)
  const [onlineSession, setOnlineSession] = useState(null)
  const [sendingInvites, setSendingInvites] = useState(false)
  const [startingGame, setStartingGame] = useState(false)
  const [lobbyError, setLobbyError] = useState('')

  const selectedGame = GAME_LIST.find((game) => game.id === selectedGameId)
  const inviteGame = GAME_LIST.find((game) => game.id === inviteGameId)
  const currentUserId = currentUser?.$id

  useEffect(() => {
    if (!currentUserId) return

    let cancelled = false

    async function loadFriends() {
      setLoadingFriends(true)
      setFriendsError('')

      try {
        const contactsResponse = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: CONTACTS_TABLE_ID,
          queries: [
            Query.equal('ownerId', [currentUserId]),
            Query.equal('status', ['accepted']),
            Query.limit(500),
          ],
        })
        const contacts = contactsResponse.rows.filter(
          (contact) => contact.contactUserId !== currentUserId
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
  }, [currentUserId])

  const refreshInviteResponses = useCallback(async () => {
    if (!inviteLobby) return

    try {
      const invitees = await Promise.all(inviteLobby.invitees.map(async (invitee) => {
        if (!invitee.conversationId || invitee.status === 'failed') return invitee

        const response = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: MESSAGES_TABLE_ID,
          queries: [
            Query.equal('conversationId', [invitee.conversationId]),
            Query.equal('type', ['game_invite_response']),
            Query.orderDesc('$createdAt'),
            Query.limit(100),
          ],
        })
        const accepted = response.rows.some((message) => {
          const content = readMessage(message)
          return (
            content?.inviteId === inviteLobby.inviteId &&
            content.status === 'accepted' &&
            content.playerId === invitee.userId
          )
        })
        return { ...invitee, status: accepted ? 'accepted' : 'pending' }
      }))
      setInviteLobby((current) => {
        if (current?.inviteId !== inviteLobby.inviteId) return current
        const hasChanges = invitees.some((invitee, index) =>
          current.invitees[index]?.status !== invitee.status
        )
        return hasChanges ? { ...current, invitees } : current
      })
    } catch (error) {
      console.error('Inbjudningssvaren kunde inte hämtas:', error)
      setLobbyError(
        `Inbjudningssvaren kunde inte hämtas: ${error.message || 'Okänt fel'}`
      )
    }
  }, [inviteLobby])

  useEffect(() => {
    if (!inviteLobby) return

    refreshInviteResponses()
    const inviteConversationIds = new Set(
      inviteLobby.invitees.map((invitee) => invitee.conversationId)
    )
    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${MESSAGES_TABLE_ID}.rows`,
      ({ payload }) => {
        if (
          inviteConversationIds.has(payload?.conversationId) &&
          payload.type === 'game_invite_response'
        ) {
          refreshInviteResponses()
        }
      }
    )
    const timer = window.setInterval(refreshInviteResponses, 5000)
    return () => {
      unsubscribe()
      window.clearInterval(timer)
    }
  }, [inviteLobby?.inviteId, inviteLobby?.invitees, refreshInviteResponses])

  function openInvitePicker(gameId) {
    setInviteGameId(gameId)
    setSelectedFriendIds([])
    setLobbyError('')
  }

  function toggleFriend(userId) {
    setSelectedFriendIds((selected) => selected.includes(userId)
      ? selected.filter((id) => id !== userId)
      : [...selected, userId])
  }

  async function sendInvitations() {
    if (!inviteGame || !currentUserId || sendingInvites) return

    const minimumInvitees = Math.max(1, inviteGame.minPlayers - 1)
    const maximumInvitees = inviteGame.maxPlayers - 1
    const existingInvitees = inviteLobby?.invitees || []
    const remainingSlots = maximumInvitees - existingInvitees.length
    const selectedFriends = selectedFriendIds
      .filter((userId) => !existingInvitees.some((invitee) => invitee.userId === userId))
      .slice(0, remainingSlots)
      .map((userId) => friends.find((friend) => friend.userId === userId))
      .filter(Boolean)

    if (
      selectedFriends.length < (inviteLobby ? 1 : minimumInvitees) ||
      selectedFriends.length > remainingSlots
    ) {
      setLobbyError(
        `Välj ${inviteLobby ? 'minst 1' : minimumInvitees} och högst ${remainingSlots} kompisar.`
      )
      return
    }

    setSendingInvites(true)
    setLobbyError('')
    const inviteId = inviteLobby?.inviteId || ID.unique()
    const outcomes = await Promise.all(selectedFriends.map(async (friend) => {
      try {
        const conversation = await ensureDirectConversation(currentUserId, friend.userId)
        const invite = {
          inviteId,
          gameId: inviteGame.id,
          gameName: inviteGame.name,
          fromUserId: currentUserId,
          fromName: currentUser.name || 'Din kompis',
          toUserId: friend.userId,
        }
        await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: MESSAGES_TABLE_ID,
          rowId: ID.unique(),
          data: {
            conversationId: conversation.$id,
            senderId: currentUserId,
            text: JSON.stringify(invite),
            type: 'game_invite',
          },
          permissions: [
            Permission.read(Role.users()),
            Permission.update(Role.user(currentUserId)),
            Permission.delete(Role.user(currentUserId)),
          ],
        })
        return { ...friend, conversationId: conversation.$id, status: 'pending' }
      } catch (error) {
        console.error(`Spelinbjudan till ${friend.username} kunde inte skickas:`, error)
        return { ...friend, status: 'failed' }
      }
    }))

    const invitees = [...(inviteLobby?.invitees || []), ...outcomes]
    const failed = outcomes.filter((invitee) => invitee.status === 'failed')
    if (invitees.some((invitee) => invitee.conversationId)) {
      setInviteLobby({ gameId: inviteGame.id, inviteId, invitees })
      setSelectedFriendIds([])
      setInviteGameId(null)
    }
    if (failed.length) {
      setLobbyError(
        `Inbjudan kunde inte skickas till: ${failed.map((friend) => friend.username).join(', ')}.`
      )
    }
    setSendingInvites(false)
  }

  async function retryInvitation(invitee) {
    if (!inviteLobby || !currentUserId) return
    setLobbyError('')
    try {
      const conversation = await ensureDirectConversation(currentUserId, invitee.userId)
      await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: MESSAGES_TABLE_ID,
        rowId: ID.unique(),
        data: {
          conversationId: conversation.$id,
          senderId: currentUserId,
          text: JSON.stringify({
            inviteId: inviteLobby.inviteId,
            gameId: inviteLobby.gameId,
            gameName: selectedGame?.name || 'Spel',
            fromUserId: currentUserId,
            fromName: currentUser.name || 'Din kompis',
            toUserId: invitee.userId,
          }),
          type: 'game_invite',
        },
        permissions: [
          Permission.read(Role.users()),
          Permission.update(Role.user(currentUserId)),
          Permission.delete(Role.user(currentUserId)),
        ],
      })
      setInviteLobby((current) => ({
        ...current,
        invitees: current.invitees.map((item) =>
          item.userId === invitee.userId
            ? { ...item, conversationId: conversation.$id, status: 'pending' }
            : item
        ),
      }))
    } catch (error) {
      console.error(`Spelinbjudan till ${invitee.username} kunde inte skickas:`, error)
      setLobbyError(
        `Spelinbjudan kunde inte skickas: ${error.message || 'Okänt fel'}`
      )
    }
  }

  async function startOnlineGame() {
    if (!inviteLobby || !selectedGame || startingGame) return

    const acceptedInvitees = inviteLobby.invitees
      .filter((invitee) => invitee.status === 'accepted')
      .slice(0, selectedGame.maxPlayers - 1)
    if (acceptedInvitees.length + 1 < selectedGame.minPlayers) {
      setLobbyError(`Minst ${selectedGame.minPlayers} spelare krävs för att starta.`)
      return
    }

    setStartingGame(true)
    setLobbyError('')
    const playerIds = [currentUserId, ...acceptedInvitees.map((invitee) => invitee.userId)]

    try {
      await Promise.all(inviteLobby.invitees
        .filter((invitee) => invitee.conversationId)
        .map((invitee) => tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: MESSAGES_TABLE_ID,
          rowId: ID.unique(),
          data: {
            conversationId: invitee.conversationId,
            senderId: currentUserId,
            text: JSON.stringify({
              inviteId: inviteLobby.inviteId,
              gameId: selectedGame.id,
              playerIds,
              startedBy: currentUserId,
            }),
            type: 'game_session_start',
          },
          permissions: [
            Permission.read(Role.users()),
            Permission.update(Role.user(currentUserId)),
            Permission.delete(Role.user(currentUserId)),
          ],
        })))

      const opponent = acceptedInvitees[0]
      setOnlineSession({
        inviteId: inviteLobby.inviteId,
        gameId: selectedGame.id,
        conversationId: opponent.conversationId,
        role: 'host',
        hostUserId: currentUserId,
        opponentUserId: opponent.userId,
        opponentName: opponent.username,
        playerIds,
      })
      setInviteLobby(null)
      setInviteGameId(null)
    } catch (error) {
      console.error('Spelet kunde inte startas:', error)
      setLobbyError(`Spelet kunde inte startas: ${error.message || 'Okänt fel'}`)
    } finally {
      setStartingGame(false)
    }
  }

  function leaveSelectedGame() {
    setSelectedGameId(null)
    setInviteGameId(null)
    setInviteLobby(null)
    setOnlineSession(null)
    setLobbyError('')
  }

  const acceptedCount = inviteLobby?.invitees.filter(
    (invitee) => invitee.status === 'accepted'
  ).length || 0
  const minimumPlayersMet = Boolean(
    selectedGame && acceptedCount + 1 >= selectedGame.minPlayers
  )
  const existingInviteeIds = new Set(
    inviteLobby?.invitees.map((invitee) => invitee.userId) || []
  )
  const inviteSlotsLeft = inviteGame
    ? inviteGame.maxPlayers - 1 - (inviteLobby?.invitees.length || 0)
    : 0

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
          onClick={selectedGameId ? leaveSelectedGame : onExit}
          aria-label={selectedGameId ? 'Tillbaka till spel' : 'Stäng spel'}
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <div>
          <h1>{selectedGame?.name || 'Spel'}</h1>
        </div>
      </header>

      {selectedGame ? (
        inviteGame ? (
          <div className="game-invite-picker">
            <h2>Bjud in till {inviteGame.name}</h2>
            <p>
              Välj {inviteLobby ? 'minst 1' : `${inviteGame.minPlayers - 1}–${inviteGame.maxPlayers - 1}`} kompisar.
              Du kan bjuda in högst {inviteGame.maxPlayers - 1} utöver dig själv.
            </p>
            {loadingFriends && <p>Laddar kompisar...</p>}
            {friendsError && <p className="game-error" role="alert">{friendsError}</p>}
            {!loadingFriends && !friendsError && friends.length === 0 && (
              <p>Du har inga accepterade kompisar att bjuda in ännu.</p>
            )}
            {friends.filter((friend) => !existingInviteeIds.has(friend.userId)).map((friend) => {
              const isSelected = selectedFriendIds.includes(friend.userId)
              const selectionFull = selectedFriendIds.length >= inviteSlotsLeft
              return (
                <button
                  type="button"
                  className={`game-friend-option ${isSelected ? 'is-selected' : ''}`}
                  key={friend.userId}
                  onClick={() => toggleFriend(friend.userId)}
                  disabled={!isSelected && selectionFull}
                  aria-pressed={isSelected}
                >
                  <span className="game-friend-avatar">
                    {friend.username.slice(0, 1).toUpperCase()}
                  </span>
                  <strong>@{friend.username}</strong>
                  <span>{isSelected ? 'Vald' : 'Välj'}</span>
                </button>
              )
            })}
            {lobbyError && <p className="game-error" role="alert">{lobbyError}</p>}
            <button
              type="button"
              className="game-primary-button"
              onClick={sendInvitations}
              disabled={sendingInvites || selectedFriendIds.length === 0}
            >
              {sendingInvites ? 'Skickar...' : 'Skicka inbjudan'}
            </button>
            <button
              type="button"
              className="game-text-button"
              onClick={() => setInviteGameId(null)}
            >
              Tillbaka
            </button>
          </div>
        ) : inviteLobby && !onlineSession ? (
          <div className="game-invite-lobby">
            <h2>Inbjudningar</h2>
            <p>
              {acceptedCount + 1} av minst {selectedGame.minPlayers} spelare har tackat ja.
              Du startar när du är redo.
            </p>
            {inviteLobby.invitees.map((invitee) => (
              <div className="game-lobby-player" key={invitee.userId}>
                <strong>@{invitee.username}</strong>
                <span>
                  {invitee.status === 'accepted'
                    ? 'Tackat ja'
                    : invitee.status === 'failed'
                      ? 'Inbjudan misslyckades'
                      : 'Väntar på svar'}
                </span>
                {invitee.status === 'failed' && (
                  <button type="button" onClick={() => retryInvitation(invitee)}>
                    Försök igen
                  </button>
                )}
              </div>
            ))}
            {lobbyError && <p className="game-error" role="alert">{lobbyError}</p>}
            {inviteLobby.invitees.length < selectedGame.maxPlayers - 1 && (
              <button
                type="button"
                className="game-text-button"
                onClick={() => openInvitePicker(selectedGame.id)}
              >
                Bjud in fler
              </button>
            )}
            <button
              type="button"
              className="game-primary-button"
              onClick={startOnlineGame}
              disabled={!minimumPlayersMet || startingGame}
            >
              {startingGame ? 'Startar...' : 'Starta spelet'}
            </button>
            {!minimumPlayersMet && (
              <p className="game-error">
                Spelet kan starta när minst {selectedGame.minPlayers} spelare har tackat ja.
              </p>
            )}
          </div>
        ) : (
          <selectedGame.Component
            currentUser={currentUser}
            initialInvite={initialInvite}
            onlineSession={onlineSession}
            onInviteFriends={() => openInvitePicker(selectedGame.id)}
            onBack={leaveSelectedGame}
          />
        )
      ) : (
        <div className="game-card-grid">
          {GAME_LIST.map((game) => (
            <button
              type="button"
              key={game.id}
              className="game-card"
              onClick={() => {
                setSelectedGameId(game.id)
                setInviteLobby(null)
                setOnlineSession(null)
              }}
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
