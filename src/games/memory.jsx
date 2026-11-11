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
const BOT_PLAYER_ID = 'memory-bot'

function allCardsMatched(matched) {
  return matched.every(Boolean)
}

function chooseRandom(items) {
  return items[Math.floor(Math.random() * items.length)]
}

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

function playerName(session, userId, currentUserId, players = session?.players) {
  if (userId === currentUserId) return 'Du'
  return players?.find((player) => player.userId === userId)?.username ||
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
  onScore,
  initialInvite,
  onlineSession,
  onInviteFriends,
  onReplay,
  replayingGame,
  onBack,
}) {
  const currentUserId = currentUser?.$id
  const localPlayerId = currentUserId || 'local-player'
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
  const [mode, setMode] = useState(null)
  const [started, setStarted] = useState(Boolean(onlineSession?.role === 'host'))
  const [gameState, setGameState] = useState(null)
  const [selectedCards, setSelectedCards] = useState([])
  const [sendingMove, setSendingMove] = useState(false)
  const [resolvedMoveId, setResolvedMoveId] = useState(null)
  const [celebrationId, setCelebrationId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const seenMatchId = useRef(null)
  const botMemory = useRef(new Map())
  const [botGameId, setBotGameId] = useState(null)
  const scoredEventsRef = useRef(new Set())

  useEffect(() => {
    if (!onlineSession) return
    setSession(onlineSession)
    setStarted(onlineSession.role === 'host')
    setGameState(null)
    setSelectedCards([])
    setResolvedMoveId(null)
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

  useEffect(() => {
    const lastTurn = gameState?.lastTurn
    if (!lastTurn?.isMatch || seenMatchId.current === lastTurn.id) return undefined

    seenMatchId.current = lastTurn.id
    setCelebrationId(lastTurn.id)
    const timer = window.setTimeout(() => {
      setCelebrationId((current) => current === lastTurn.id ? null : current)
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [gameState?.lastTurn?.id, gameState?.lastTurn?.isMatch])

  function startBotGame() {
    const gameId = ID.unique()
    const deck = makeDeck(gameId)
    botMemory.current.clear()
    setBotGameId(gameId)
    setSession(null)
    setStarted(true)
    setMode('bot')
    setSelectedCards([])
    setResolvedMoveId(null)
    setCelebrationId(null)
    setErrorMessage('')
    setGameState({
      deck,
      matched: Array(deck.length).fill(false),
      scores: { [localPlayerId]: 0, [BOT_PLAYER_ID]: 0 },
      currentPlayerId: localPlayerId,
      lastTurn: null,
      players: [
        { userId: localPlayerId, username: currentUser?.username || currentUser?.name || 'Du' },
        { userId: BOT_PLAYER_ID, username: 'Boten' },
      ],
    })
  }

  useEffect(() => {
    if (
      mode !== 'bot' ||
      !gameState ||
      gameState.currentPlayerId !== BOT_PLAYER_ID ||
      selectedCards.length ||
      allCardsMatched(gameState.matched) ||
      (gameState.lastTurn && !gameState.lastTurn.isMatch &&
        resolvedMoveId !== gameState.lastTurn.id)
    ) return undefined

    const timer = window.setTimeout(() => {
      const available = gameState.deck
        .map((_, index) => index)
        .filter((index) => !gameState.matched[index])
      const knownCards = botMemory.current
      const knownPairs = new Map()
      available.forEach((index) => {
        const pairId = knownCards.get(index)
        if (pairId === undefined) return
        knownPairs.set(pairId, [...(knownPairs.get(pairId) || []), index])
      })

      const knownMatch = [...knownPairs.values()].find((pair) => pair.length >= 2)
      let firstCard
      let secondCard
      if (knownMatch) {
        [firstCard, secondCard] = knownMatch
      } else {
        const unknown = available.filter((index) => !knownCards.has(index))
        firstCard = chooseRandom(unknown.length ? unknown : available)
        knownCards.set(firstCard, gameState.deck[firstCard].pairId)
        const rememberedMatch = available.find((index) =>
          index !== firstCard &&
          knownCards.get(index) === gameState.deck[firstCard].pairId
        )
        const remainingUnknown = available.filter((index) =>
          index !== firstCard && !knownCards.has(index)
        )
        secondCard = rememberedMatch ??
          chooseRandom(remainingUnknown.length ? remainingUnknown : available.filter(
            (index) => index !== firstCard
          ))
      }

      knownCards.set(firstCard, gameState.deck[firstCard].pairId)
      knownCards.set(secondCard, gameState.deck[secondCard].pairId)
      setSelectedCards([firstCard, secondCard])
    }, 850)
    return () => window.clearTimeout(timer)
  }, [mode, gameState, selectedCards, resolvedMoveId])

  useEffect(() => {
    if (mode !== 'bot' || selectedCards.length !== 2 || !gameState) return undefined

    const [firstCard, secondCard] = selectedCards
    const timer = window.setTimeout(() => {
      const isMatch = gameState.deck[firstCard].pairId === gameState.deck[secondCard].pairId
      const nextTurnId = ID.unique()
      setGameState((current) => {
        if (!current) return current
        const matched = [...current.matched]
        const scores = { ...current.scores }
        if (isMatch) {
          matched[firstCard] = true
          matched[secondCard] = true
          scores[current.currentPlayerId] += 1
        }
        const playerIds = current.players.map((player) => player.userId)
        const nextPlayer = isMatch
          ? current.currentPlayerId
          : playerIds[(playerIds.indexOf(current.currentPlayerId) + 1) % playerIds.length]
        return {
          ...current,
          matched,
          scores,
          currentPlayerId: nextPlayer,
          lastTurn: {
            id: nextTurnId,
            firstCard,
            secondCard,
            playerId: current.currentPlayerId || localPlayerId,
            isMatch,
          },
        }
      })
      setSelectedCards([])
    }, 700)
    return () => window.clearTimeout(timer)
  }, [mode, selectedCards, gameState, currentUserId])

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
      gameState.currentPlayerId !== localPlayerId ||
      gameState.matched[index] ||
      selectedCards.includes(index) ||
      sendingMove ||
      (gameState.lastTurn && !gameState.lastTurn.isMatch &&
        resolvedMoveId !== gameState.lastTurn.id)
    ) return

    const nextSelection = [...selectedCards, index]
    if (mode === 'bot') {
      botMemory.current.set(index, gameState.deck[index].pairId)
    }
    setSelectedCards(nextSelection)
    if (nextSelection.length === 2 && mode !== 'bot') {
      sendTurn(nextSelection[0], nextSelection[1])
    }
  }

  const allPairsFound = gameState?.matched.every(Boolean) ?? false
  const ownScore = gameState?.scores[localPlayerId] || 0
  const opponent = gameState?.players.find((player) => player.userId !== localPlayerId)
  const opponentScore = opponent ? gameState?.scores[opponent.userId] || 0 : 0
  const opponentName = playerName(session, opponent?.userId, localPlayerId, gameState?.players)
  const winnerText = ownScore === opponentScore
    ? 'Det blev oavgjort!'
    : ownScore > opponentScore
      ? 'Du vann! 🎉'
      : `${opponentName} vann!`

  function awardScore(eventId) {
    if (!onScore || scoredEventsRef.current.has(eventId)) return
    scoredEventsRef.current.add(eventId)
    Promise.resolve(onScore(1, eventId)).catch((error) => {
      scoredEventsRef.current.delete(eventId)
      console.error('Twist Score kunde inte uppdateras efter Memory:', error)
      setErrorMessage(
        `Twist Score kunde inte uppdateras: ${error.message || 'Okänt fel'}`
      )
    })
  }

  useEffect(() => {
    const gameId = mode === 'bot' ? botGameId : session?.inviteId
    if (!gameId || !started || !gameState) return
    awardScore(`played:${gameId}`)
  }, [mode, botGameId, session?.inviteId, started, gameState, onScore])

  useEffect(() => {
    const gameId = mode === 'bot' ? botGameId : session?.inviteId
    if (!gameId || !allPairsFound || ownScore <= opponentScore) return
    awardScore(`won:${gameId}`)
  }, [
    mode,
    botGameId,
    session?.inviteId,
    allPairsFound,
    ownScore,
    opponentScore,
    onScore,
  ])
  const latestMismatchVisible = Boolean(
    gameState?.lastTurn &&
    !gameState.lastTurn.isMatch &&
    gameState.lastTurn.id !== resolvedMoveId
  )

  return (
    <div className="memory-game">
      {!session && mode !== 'bot' && (
        <div className="memory-intro">
          <div className="memory-intro-emoji" aria-hidden="true">🧠</div>
          <h2>Vänd två kort. Hitta paret.</h2>
          <p>Hitta tio emoji-par. Om du hittar ett par får du en tur till!</p>
          <div className="memory-mode-picker">
            <button type="button" onClick={startBotGame}>
              <span aria-hidden="true">🤖</span>
              <strong>Spela mot bot</strong>
              <small>En klurig motståndare, direkt här.</small>
            </button>
            <button type="button" onClick={onInviteFriends}>
              <span aria-hidden="true">👯</span>
              <strong>Spela med kompis</strong>
              <small>Bjud in en kompis till en match.</small>
            </button>
          </div>
        </div>
      )}

      {(session || mode === 'bot') && (
        <>
          <div className="memory-scoreboard">
            <div className={`memory-player ${gameState?.currentPlayerId === localPlayerId ? 'is-active' : ''}`}>
              <span className="memory-player-avatar">✨</span>
              <span><strong>Du</strong><small>{ownScore} par</small></span>
            </div>
            <span className="memory-score-divider">VS</span>
            <div className={`memory-player ${gameState?.currentPlayerId === opponent?.userId ? 'is-active' : ''}`}>
              <span className="memory-player-avatar">💜</span>
              <span>
                <strong>{opponentName}</strong>
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
                : gameState?.currentPlayerId === localPlayerId
                  ? selectedCards.length === 1
                    ? 'Välj ett kort till!'
                    : 'Din tur – hitta ett par!'
                  : mode === 'bot'
                    ? 'Botens tur...'
                    : `${playerName(session, gameState?.currentPlayerId, localPlayerId)}s tur`}
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
                    gameState.currentPlayerId !== localPlayerId ||
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
          {mode === 'bot' && allPairsFound && (
            <button type="button" className="game-primary-button" onClick={startBotGame}>
              Spela igen
            </button>
          )}
          {(session?.role === 'host' || session?.role === 'guest') && allPairsFound && (
            <button
              type="button"
              className="game-primary-button"
              onClick={onReplay}
              disabled={replayingGame}
            >
              {replayingGame ? 'Startar...' : 'Spela igen'}
            </button>
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
