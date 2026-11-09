import { useCallback, useEffect, useRef, useState } from 'react'
import { ID, Permission, Query, Role } from 'appwrite'

import {
  client,
  tablesDB,
  DATABASE_ID,
  MESSAGES_TABLE_ID,
} from '../lib/appwrite.js'
import './memory.css'

const EMOJIS = ['🍓', '🦋', '🌈', '🍉', '🐸', '🍄', '🌸', '🧸', '🍋', '🪩']

function makeDeck(seed) {
  let value = 2166136261
  for (const character of seed) {
    value = Math.imul(value ^ character.charCodeAt(0), 16777619)
  }
  const random = () => {
    value += 0x6d2b79f5
    let number = value
    number = Math.imul(number ^ (number >>> 15), number | 1)
    number ^= number + Math.imul(number ^ (number >>> 7), number | 61)
    return ((number ^ (number >>> 14)) >>> 0) / 4294967296
  }
  const deck = EMOJIS.flatMap((emoji, pairId) => [
    { emoji, pairId },
    { emoji, pairId },
  ])
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]]
  }
  return deck
}

function readMessage(message) {
  try {
    return JSON.parse(message.text)
  } catch (error) {
    console.error('Ogiltigt Memory-meddelande:', error)
    return null
  }
}

function playerName(session, userId, currentUserId) {
  if (userId === currentUserId) return 'Du'
  return session?.players?.find((player) => player.userId === userId)?.username ||
    session?.opponentName ||
    'Din kompis'
}

function replayTurns(deck, players, messages, inviteId) {
  const playerIds = players.map((player) => player.userId)
  const matched = Array(deck.length).fill(false)
  const scores = Object.fromEntries(playerIds.map((playerId) => [playerId, 0]))
  let currentPlayerId = playerIds[0] || null
  let lastTurn = null

  messages.forEach((message) => {
    const turn = readMessage(message)
    if (
      message.type !== 'game_memory_turn' ||
      turn?.inviteId !== inviteId ||
      turn.playerId !== message.senderId ||
      turn.playerId !== currentPlayerId ||
      !playerIds.includes(turn.playerId) ||
      !Number.isInteger(turn.firstCard) ||
      !Number.isInteger(turn.secondCard) ||
      turn.firstCard < 0 ||
      turn.secondCard < 0 ||
      turn.firstCard >= deck.length ||
      turn.secondCard >= deck.length ||
      turn.firstCard === turn.secondCard ||
      matched[turn.firstCard] ||
      matched[turn.secondCard]
    ) return

    const isMatch = deck[turn.firstCard].pairId === deck[turn.secondCard].pairId
    if (isMatch) {
      matched[turn.firstCard] = true
      matched[turn.secondCard] = true
      scores[turn.playerId] += 1
    } else {
      currentPlayerId = playerIds[(playerIds.indexOf(currentPlayerId) + 1) % playerIds.length]
    }
    lastTurn = {
      id: message.$id,
      firstCard: turn.firstCard,
      secondCard: turn.secondCard,
      playerId: turn.playerId,
      isMatch,
    }
  })

  return { matched, scores, currentPlayerId, lastTurn }
}

export default function Memory({
  currentUser,
  initialInvite,
  onlineSession,
  onInviteFriends,
  onBack,
}) {
  const currentUserId = currentUser?.$id
  const [session, setSession] = useState(() => onlineSession || (initialInvite
    ? {
      ...initialInvite,
      role: 'guest',
      hostUserId: initialInvite.fromUserId,
      opponentUserId: currentUserId,
      opponentName: initialInvite.fromName || 'Din kompis',
      players: [],
    }
    : null))
  const [started, setStarted] = useState(Boolean(onlineSession?.role === 'host'))
  const [gameState, setGameState] = useState(null)
  const [selectedCards, setSelectedCards] = useState([])
  const [sendingMove, setSendingMove] = useState(false)
  const [resolvedMoveId, setResolvedMoveId] = useState(null)
  const [celebrationId, setCelebrationId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const seenMatchId = useRef(null)

  useEffect(() => {
    if (!onlineSession) return
    setSession(onlineSession)
    setStarted(onlineSession.role === 'host')
  }, [onlineSession])

  const updateGame = useCallback(async () => {
    if (!session?.conversationId || !session.inviteId) return

    try {
      const response = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: MESSAGES_TABLE_ID,
        queries: [
          Query.equal('conversationId', [session.conversationId]),
          Query.equal('type', ['game_session_start', 'game_memory_turn']),
          Query.orderAsc('$createdAt'),
          Query.limit(500),
        ],
      })
      const messages = response.rows.filter((message) =>
        readMessage(message)?.inviteId === session.inviteId
      )
      const startMessage = messages.find((message) =>
        message.type === 'game_session_start' &&
        readMessage(message)?.startedBy === session.hostUserId
      )
      const startContent = startMessage ? readMessage(startMessage) : null
      const players = startContent?.players?.filter((player) =>
        typeof player?.userId === 'string'
      ) || session.players || []
      const validPlayers = players.slice(0, 2)

      if (validPlayers.length === 2) {
        setStarted(true)
        const deck = makeDeck(session.inviteId)
        const nextState = replayTurns(deck, validPlayers, messages, session.inviteId)
        setGameState({ ...nextState, deck, players: validPlayers })
        if (nextState.lastTurn?.isMatch && seenMatchId.current !== nextState.lastTurn.id) {
          seenMatchId.current = nextState.lastTurn.id
          setCelebrationId(nextState.lastTurn.id)
          window.setTimeout(() => {
            setCelebrationId((current) =>
              current === nextState.lastTurn.id ? null : current
            )
          }, 1200)
        }
      }
      setErrorMessage('')
    } catch (error) {
      console.error('Memory kunde inte synkroniseras:', error)
      setErrorMessage(`Spelet kunde inte synkroniseras: ${error.message || 'Okänt fel'}`)
    }
  }, [session])

  useEffect(() => {
    if (!session?.conversationId) return undefined

    updateGame()
    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${MESSAGES_TABLE_ID}.rows`,
      ({ payload }) => {
        if (
          payload?.conversationId === session.conversationId &&
          (payload.type === 'game_memory_turn' ||
            payload.type === 'game_session_start')
        ) {
          updateGame()
        }
      }
    )
    return unsubscribe
  }, [session?.conversationId, session?.inviteId, updateGame])

  useEffect(() => {
    const lastTurn = gameState?.lastTurn
    if (!lastTurn || lastTurn.isMatch) return undefined

    setResolvedMoveId(null)
    const timer = window.setTimeout(() => setResolvedMoveId(lastTurn.id), 1100)
    return () => window.clearTimeout(timer)
  }, [gameState?.lastTurn?.id, gameState?.lastTurn?.isMatch])

  async function sendTurn(firstCard, secondCard) {
    if (!session?.conversationId || !currentUserId || !gameState) return
    setSendingMove(true)
    setErrorMessage('')
    try {
      await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: MESSAGES_TABLE_ID,
        rowId: ID.unique(),
        data: {
          conversationId: session.conversationId,
          senderId: currentUserId,
          text: JSON.stringify({
            inviteId: session.inviteId,
            playerId: currentUserId,
            firstCard,
            secondCard,
          }),
          type: 'game_memory_turn',
        },
        permissions: [
          Permission.read(Role.users()),
          Permission.update(Role.user(currentUserId)),
          Permission.delete(Role.user(currentUserId)),
        ],
      })
      setSelectedCards([])
      await updateGame()
    } catch (error) {
      console.error('Memory-draget kunde inte sparas:', error)
      setErrorMessage(`Draget kunde inte sparas: ${error.message || 'Okänt fel'}`)
      setSelectedCards([])
    } finally {
      setSendingMove(false)
    }
  }

  function chooseCard(index) {
    if (
      !gameState ||
      !started ||
      gameState.currentPlayerId !== currentUserId ||
      gameState.matched[index] ||
      selectedCards.includes(index) ||
      sendingMove ||
      (gameState.lastTurn && !gameState.lastTurn.isMatch &&
        resolvedMoveId !== gameState.lastTurn.id)
    ) return

    const nextSelection = [...selectedCards, index]
    setSelectedCards(nextSelection)
    if (nextSelection.length === 2) {
      sendTurn(nextSelection[0], nextSelection[1])
    }
  }

  const allPairsFound = gameState?.matched.every(Boolean) ?? false
  const ownScore = gameState?.scores[currentUserId] || 0
  const opponent = gameState?.players.find((player) => player.userId !== currentUserId)
  const opponentScore = opponent ? gameState?.scores[opponent.userId] || 0 : 0
  const winnerText = ownScore === opponentScore
    ? 'Det blev oavgjort!'
    : ownScore > opponentScore
      ? 'Du vann! 🎉'
      : `${playerName(session, opponent?.userId, currentUserId)} vann!`
  const latestMismatchVisible = Boolean(
    gameState?.lastTurn &&
    !gameState.lastTurn.isMatch &&
    gameState.lastTurn.id !== resolvedMoveId
  )

  return (
    <div className="memory-game">
      {!session && (
        <div className="memory-intro">
          <div className="memory-intro-emoji" aria-hidden="true">🧠</div>
          <h2>Vänd två kort. Hitta paret.</h2>
          <p>Spela mot en kompis. Hittar du ett par får du en tur till!</p>
          <button type="button" className="game-primary-button" onClick={onInviteFriends}>
            Bjud in en kompis
          </button>
        </div>
      )}

      {session && (
        <>
          <div className="memory-scoreboard">
            <div className={`memory-player ${gameState?.currentPlayerId === currentUserId ? 'is-active' : ''}`}>
              <span className="memory-player-avatar">✨</span>
              <span><strong>Du</strong><small>{ownScore} par</small></span>
            </div>
            <span className="memory-score-divider">VS</span>
            <div className={`memory-player ${gameState?.currentPlayerId === opponent?.userId ? 'is-active' : ''}`}>
              <span className="memory-player-avatar">💜</span>
              <span>
                <strong>{playerName(session, opponent?.userId, currentUserId)}</strong>
                <small>{opponentScore} par</small>
              </span>
            </div>
          </div>

          <p className="memory-status" aria-live="polite">
            {!started
              ? 'Väntar på att spelet ska starta...'
              : !gameState
                ? 'Laddar korten...'
              : allPairsFound
                ? winnerText
                : gameState?.currentPlayerId === currentUserId
                  ? selectedCards.length === 1
                    ? 'Välj ett kort till!'
                    : 'Din tur – hitta ett par!'
                  : `${playerName(session, gameState?.currentPlayerId, currentUserId)}s tur`}
          </p>

          <div className="memory-board" role="group" aria-label="Memory-bräde med 20 kort">
            {gameState?.deck.map((card, index) => {
              const isSelected = selectedCards.includes(index)
              const isLatestMismatch = latestMismatchVisible &&
                (gameState.lastTurn.firstCard === index ||
                  gameState.lastTurn.secondCard === index)
              const isFaceUp = gameState.matched[index] || isSelected || isLatestMismatch
              const isMatched = gameState.matched[index]
              return (
                <button
                  type="button"
                  key={index}
                  className={`memory-card ${isFaceUp ? 'is-flipped' : ''} ${isMatched ? 'is-matched' : ''}`}
                  onClick={() => chooseCard(index)}
                  disabled={
                    !started ||
                    allPairsFound ||
                    gameState.currentPlayerId !== currentUserId ||
                    isMatched ||
                    sendingMove ||
                    (!isSelected && selectedCards.length >= 2) ||
                    latestMismatchVisible
                  }
                  aria-label={isFaceUp ? `${card.emoji}${isMatched ? ', par hittat' : ''}` : `Kort ${index + 1}, PLOT TWIST`}
                  aria-pressed={isFaceUp}
                >
                  <span className="memory-card-inner">
                    <span className="memory-card-face memory-card-back">PLOT<br />TWIST</span>
                    <span className="memory-card-face memory-card-front" aria-hidden="true">{card.emoji}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {celebrationId && (
            <div className="memory-confetti" aria-hidden="true">
              {Array.from({ length: 22 }, (_, index) => (
                <i key={`${celebrationId}-${index}`} style={{ '--confetti-index': index }} />
              ))}
            </div>
          )}
        </>
      )}

      {errorMessage && <p className="game-error" role="alert">{errorMessage}</p>}
      <button type="button" className="game-text-button" onClick={onBack}>
        Tillbaka till spelen
      </button>
    </div>
  )
}
