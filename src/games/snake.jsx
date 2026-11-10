import { useCallback, useEffect, useRef, useState } from 'react'
import { ID, Permission, Query, Role } from 'appwrite'

import {
  client,
  tablesDB,
  DATABASE_ID,
  MESSAGES_TABLE_ID,
} from '../lib/appwrite.js'
import './snake.css'

const BOARD_WIDTH = 24
const BOARD_HEIGHT = 18
const TICK_MS = 155
const SYNC_MS = 230
const DIRECTIONS = {
  up: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}
const OPPOSITE_DIRECTION = {
  up: 'down',
  right: 'left',
  down: 'up',
  left: 'right',
}
const SNAKE_COLORS = ['#9cff57', '#ff6a8b', '#68d9ff', '#ffd34f']
const STARTS = [
  { head: { x: 4, y: 3 }, direction: 'right' },
  { head: { x: 19, y: 14 }, direction: 'left' },
  { head: { x: 19, y: 3 }, direction: 'left' },
  { head: { x: 4, y: 14 }, direction: 'right' },
]

function randomFood(snakes) {
  const occupied = new Set(
    snakes.flatMap((snake) => snake.body.map(({ x, y }) => `${x},${y}`))
  )
  const available = []
  for (let y = 0; y < BOARD_HEIGHT; y += 1) {
    for (let x = 0; x < BOARD_WIDTH; x += 1) {
      if (!occupied.has(`${x},${y}`)) available.push({ x, y })
    }
  }
  return available.length
    ? available[Math.floor(Math.random() * available.length)]
    : null
}

function createGameState(players, inviteId) {
  const snakes = players.map((player, index) => {
    const start = STARTS[index % STARTS.length]
    const vector = DIRECTIONS[start.direction]
    return {
      userId: player.userId,
      username: player.username,
      color: SNAKE_COLORS[index % SNAKE_COLORS.length],
      direction: start.direction,
      alive: true,
      score: 0,
      body: Array.from({ length: 4 }, (_, segment) => ({
        x: start.head.x - vector.x * segment,
        y: start.head.y - vector.y * segment,
      })),
    }
  })
  return {
    inviteId,
    tick: 0,
    snakes,
    food: randomFood(snakes),
    phase: 'playing',
    winnerId: null,
  }
}

function advanceGame(state, directions) {
  if (state.phase !== 'playing') return state

  const moving = state.snakes.map((snake) => {
    if (!snake.alive) return { ...snake, nextBody: snake.body }
    const direction = directions[snake.userId] || snake.direction
    const vector = DIRECTIONS[direction]
    const head = {
      x: snake.body[0].x + vector.x,
      y: snake.body[0].y + vector.y,
    }
    return { ...snake, direction, nextBody: [head, ...snake.body] }
  })

  const foodClaim = moving.find((snake) =>
    snake.alive &&
    state.food &&
    snake.nextBody[0].x === state.food.x &&
    snake.nextBody[0].y === state.food.y
  )
  const foodEaterId = foodClaim?.userId

  moving.forEach((snake) => {
    if (!snake.alive) return
    const eats = snake.userId === foodEaterId
    if (!eats) snake.nextBody.pop()
  })

  const crashedIds = new Set()
  moving.forEach((snake) => {
    if (!snake.alive) return
    const head = snake.nextBody[0]
    if (
      head.x < 0 ||
      head.x >= BOARD_WIDTH ||
      head.y < 0 ||
      head.y >= BOARD_HEIGHT
    ) {
      crashedIds.add(snake.userId)
      return
    }

    const ownBody = snake.nextBody.slice(1)
    if (ownBody.some((segment) => segment.x === head.x && segment.y === head.y)) {
      crashedIds.add(snake.userId)
    }
    moving.forEach((other) => {
      if (!other.alive || other.userId === snake.userId) return
      if (other.nextBody.some((segment) => segment.x === head.x && segment.y === head.y)) {
        crashedIds.add(snake.userId)
      }
    })
  })

  const snakes = moving.map((snake) => {
    if (!snake.alive) return snake
    const eats = snake.userId === foodEaterId && !crashedIds.has(snake.userId)
    const body = snake.nextBody.filter((segment) =>
      segment.x >= 0 &&
      segment.x < BOARD_WIDTH &&
      segment.y >= 0 &&
      segment.y < BOARD_HEIGHT
    )
    return {
      ...snake,
      body,
      alive: !crashedIds.has(snake.userId),
      score: snake.score + (eats ? 1 : 0),
    }
  })
  const survivors = snakes.filter((snake) => snake.alive)
  let phase = survivors.length <= 1 ? 'finished' : 'playing'
  let winnerId = survivors.length === 1 ? survivors[0].userId : null
  const food = foodEaterId && !crashedIds.has(foodEaterId)
    ? randomFood(snakes)
    : state.food

  if (!food && phase === 'playing') {
    phase = 'finished'
    const topScore = Math.max(...survivors.map((snake) => snake.score))
    const leaders = survivors.filter((snake) => snake.score === topScore)
    winnerId = leaders.length === 1 ? leaders[0].userId : null
  }

  return {
    ...state,
    tick: state.tick + 1,
    snakes,
    food,
    phase,
    winnerId,
  }
}

function readMessage(message) {
  try {
    return JSON.parse(message.text)
  } catch (error) {
    console.error('Ogiltigt Snake-meddelande:', error)
    return null
  }
}

function isValidGameState(state, inviteId) {
  return (
    state?.inviteId === inviteId &&
    Number.isInteger(state.tick) &&
    Array.isArray(state.snakes) &&
    state.snakes.length > 0 &&
    state.snakes.every((snake) =>
      typeof snake.userId === 'string' &&
      typeof snake.username === 'string' &&
      typeof snake.alive === 'boolean' &&
      Number.isInteger(snake.score) &&
      DIRECTIONS[snake.direction] &&
      Array.isArray(snake.body) &&
      snake.body.length > 0 &&
      snake.body.every((segment) =>
        Number.isInteger(segment.x) &&
        Number.isInteger(segment.y) &&
        segment.x >= 0 &&
        segment.x < BOARD_WIDTH &&
        segment.y >= 0 &&
        segment.y < BOARD_HEIGHT
      )
    ) &&
    (state.food === null || (
      Number.isInteger(state.food?.x) &&
      Number.isInteger(state.food?.y) &&
      state.food.x >= 0 &&
      state.food.x < BOARD_WIDTH &&
      state.food.y >= 0 &&
      state.food.y < BOARD_HEIGHT
    )) &&
    (state.phase === 'playing' || state.phase === 'finished')
  )
}

export default function Snake({
  currentUser,
  onScore,
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
      players: [],
    }
    : null))
  const [mode, setMode] = useState(null)
  const [soloGameId, setSoloGameId] = useState(null)
  const [gameState, setGameState] = useState(null)
  const [loadingGame, setLoadingGame] = useState(Boolean(initialInvite))
  const [errorMessage, setErrorMessage] = useState('')
  const gameStateRef = useRef(gameState)
  const directionsRef = useRef({})
  const processedInputsRef = useRef(new Set())
  const inputPollRef = useRef(false)
  const lastBroadcastRef = useRef(0)
  const broadcastingRef = useRef(false)
  const startAppliedRef = useRef(null)
  const scoredEventsRef = useRef(new Set())

  const setCurrentGameState = useCallback((nextState) => {
    gameStateRef.current = nextState
    setGameState(nextState)
  }, [])

  useEffect(() => {
    if (!onlineSession) return
    setSession(onlineSession)
    setMode(null)
  }, [onlineSession])

  useEffect(() => {
    setCurrentGameState(null)
    directionsRef.current = {}
    processedInputsRef.current.clear()
    lastBroadcastRef.current = 0
  }, [session?.inviteId, setCurrentGameState])

  useEffect(() => {
    if (!initialInvite?.inviteId || onlineSession || !currentUserId) return

    let cancelled = false
    const ownConversationId = initialInvite.conversationId

    function applyStartMessage(message) {
      const start = readMessage(message)
      if (
        start?.inviteId !== initialInvite.inviteId ||
        start.gameId !== 'snake' ||
        message.senderId !== initialInvite.fromUserId ||
        startAppliedRef.current === initialInvite.inviteId
      ) return
      startAppliedRef.current = initialInvite.inviteId
      if (!start.playerIds?.includes(currentUserId)) {
        setErrorMessage('Spelet har redan startat utan dig.')
        return
      }
      setSession({
        ...start,
        conversationId: ownConversationId,
        hostUserId: start.startedBy || initialInvite.fromUserId,
        role: 'guest',
        players: start.players || [],
      })
    }

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${MESSAGES_TABLE_ID}.rows`,
      ({ payload }) => {
        if (
          !cancelled &&
          payload?.conversationId === ownConversationId &&
          payload.type === 'game_session_start'
        ) {
          applyStartMessage(payload)
        }
      }
    )

    async function loadStartedGame() {
      if (!ownConversationId) return
      setLoadingGame(true)
      try {
        const response = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: MESSAGES_TABLE_ID,
          queries: [
            Query.equal('conversationId', [ownConversationId]),
            Query.equal('type', ['game_session_start']),
            Query.orderDesc('$createdAt'),
            Query.limit(100),
          ],
        })
        const startMessage = response.rows.find((message) =>
          readMessage(message)?.inviteId === initialInvite.inviteId
        )
        if (!cancelled && startMessage) applyStartMessage(startMessage)
      } catch (error) {
        console.error('Snake-sessionen kunde inte hämtas:', error)
        setErrorMessage(`Spelet kunde inte hämtas: ${error.message || 'Okänt fel'}`)
      } finally {
        if (!cancelled) setLoadingGame(false)
      }
    }

    loadStartedGame()
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [initialInvite, onlineSession, currentUserId])

  useEffect(() => {
    if (session?.role !== 'host' || !session.players?.length) return
    const nextState = createGameState(session.players, session.inviteId)
    directionsRef.current = Object.fromEntries(
      nextState.snakes.map((snake) => [snake.userId, snake.direction])
    )
    setCurrentGameState(nextState)
  }, [session?.inviteId, session?.role, session?.players, setCurrentGameState])

  useEffect(() => {
    if (mode !== 'solo' || !currentUserId) return
    const player = {
      userId: currentUserId,
      username: currentUser.username || currentUser.name || 'Du',
    }
    const nextState = createGameState([player], soloGameId)
    directionsRef.current = { [currentUserId]: nextState.snakes[0].direction }
    setCurrentGameState(nextState)
  }, [mode, soloGameId, currentUser, currentUserId, setCurrentGameState])

  const writeGameMessage = useCallback(async (conversationId, senderId, type, data) => {
    if (!conversationId || !senderId) throw new Error('Spelkonversationen saknas.')
    await tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: MESSAGES_TABLE_ID,
      rowId: ID.unique(),
      data: {
        conversationId,
        senderId,
        text: JSON.stringify(data),
        type,
      },
      permissions: [
        Permission.read(Role.users()),
        Permission.update(Role.user(senderId)),
        Permission.delete(Role.user(senderId)),
      ],
    })
  }, [])

  const acceptInputMessage = useCallback((message) => {
    if (
      !message?.$id ||
      processedInputsRef.current.has(message.$id) ||
      message.type !== 'game_snake_input' ||
      session?.role !== 'host' ||
      !session.players?.some((player) => player.userId === message.senderId)
    ) return

    const content = readMessage(message)
    const snake = gameStateRef.current?.snakes.find(
      (item) => item.userId === message.senderId && item.alive
    )
    if (
      content?.inviteId !== session.inviteId ||
      !DIRECTIONS[content.direction] ||
      !snake
    ) return

    processedInputsRef.current.add(message.$id)
    const currentDirection = snake.direction
    const pendingDirection =
      directionsRef.current[message.senderId] || currentDirection
    if (
      pendingDirection !== content.direction &&
      OPPOSITE_DIRECTION[currentDirection] !== content.direction
    ) {
      directionsRef.current[message.senderId] = content.direction
    }
  }, [session])

  const refreshInputs = useCallback(async () => {
    if (
      inputPollRef.current ||
      session?.role !== 'host' ||
      !session.players?.length
    ) return

    inputPollRef.current = true
    try {
      const responses = await Promise.all(session.players
        .filter((player) => player.userId !== session.hostUserId && player.conversationId)
        .map((player) => tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: MESSAGES_TABLE_ID,
          queries: [
            Query.equal('conversationId', [player.conversationId]),
            Query.equal('type', ['game_snake_input']),
            Query.orderDesc('$createdAt'),
            Query.limit(100),
          ],
        })))
      responses.flatMap((response) => response.rows)
        .sort((a, b) => a.$createdAt.localeCompare(b.$createdAt))
        .forEach(acceptInputMessage)
    } catch (error) {
      console.error('Snake-kommandon kunde inte hämtas:', error)
      setErrorMessage(`Spelet kunde inte uppdateras: ${error.message || 'Okänt fel'}`)
    } finally {
      inputPollRef.current = false
    }
  }, [session, acceptInputMessage])

  useEffect(() => {
    if (session?.role !== 'host' || !session.players?.length) return
    refreshInputs()
    const timer = window.setInterval(refreshInputs, 1500)
    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${MESSAGES_TABLE_ID}.rows`,
      ({ payload }) => {
        const player = session.players.find(
          (item) => item.userId === payload?.senderId
        )
        if (
          payload?.type === 'game_snake_input' &&
          player?.conversationId === payload.conversationId
        ) {
          acceptInputMessage(payload)
        }
      }
    )
    return () => {
      window.clearInterval(timer)
      unsubscribe()
    }
  }, [session, refreshInputs, acceptInputMessage])

  const applyStateMessage = useCallback((message) => {
    if (
      message?.type !== 'game_snake_state' ||
      message.senderId !== session?.hostUserId
    ) return
    const content = readMessage(message)
    if (
      content?.inviteId !== session.inviteId ||
      !isValidGameState(content.state, session.inviteId) ||
      content.state.tick <= (gameStateRef.current?.tick ?? -1)
    ) return
    directionsRef.current = Object.fromEntries(
      content.state.snakes.map((snake) => [snake.userId, snake.direction])
    )
    setCurrentGameState(content.state)
  }, [session, setCurrentGameState])

  useEffect(() => {
    if (
      session?.role !== 'guest' ||
      !session.conversationId ||
      !session.inviteId
    ) return

    let cancelled = false
    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${MESSAGES_TABLE_ID}.rows`,
      ({ payload }) => {
        if (
          payload?.conversationId === session.conversationId &&
          payload.type === 'game_snake_state'
        ) {
          applyStateMessage(payload)
        }
      }
    )

    async function loadLatestState() {
      setLoadingGame(true)
      try {
        const response = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: MESSAGES_TABLE_ID,
          queries: [
            Query.equal('conversationId', [session.conversationId]),
            Query.equal('type', ['game_snake_state']),
            Query.orderDesc('$createdAt'),
            Query.limit(100),
          ],
        })
        const latest = response.rows.find((message) =>
          readMessage(message)?.inviteId === session.inviteId
        )
        if (!cancelled && latest) applyStateMessage(latest)
      } catch (error) {
        console.error('Snake-spelet kunde inte synkroniseras:', error)
        setErrorMessage(`Spelet kunde inte synkroniseras: ${error.message || 'Okänt fel'}`)
      } finally {
        if (!cancelled) setLoadingGame(false)
      }
    }

    loadLatestState()
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [session?.role, session?.conversationId, session?.inviteId, applyStateMessage])

  useEffect(() => {
    if (!gameState || gameState.phase !== 'playing') return
    const isHost = session?.role === 'host'
    if (session && !isHost) return

    const timer = window.setInterval(() => {
      const current = gameStateRef.current
      if (!current || current.phase !== 'playing') return
      const nextState = advanceGame(current, directionsRef.current)
      setCurrentGameState(nextState)

      if (
        session &&
        (
          Date.now() - lastBroadcastRef.current >= SYNC_MS ||
          nextState.phase === 'finished'
        ) &&
        !broadcastingRef.current
      ) {
        lastBroadcastRef.current = Date.now()
        broadcastingRef.current = true
        Promise.all(session.players
          .filter((player) => player.userId !== session.hostUserId && player.conversationId)
          .map((player) => writeGameMessage(
            player.conversationId,
            session.hostUserId,
            'game_snake_state',
            { inviteId: session.inviteId, state: nextState }
          )))
          .catch((error) => {
            console.error('Snake-spelets läge kunde inte skickas:', error)
            setErrorMessage(`Spelet kunde inte synkroniseras: ${error.message || 'Okänt fel'}`)
          })
          .finally(() => {
            broadcastingRef.current = false
          })
      }
    }, TICK_MS)

    return () => window.clearInterval(timer)
  }, [gameState?.phase, session, writeGameMessage, setCurrentGameState])

  const handleDirection = useCallback(async (direction) => {
    const activeState = gameStateRef.current
    const snake = activeState?.snakes.find(
      (item) => item.userId === currentUserId && item.alive
    )
    if (
      activeState?.phase !== 'playing' ||
      !snake ||
      !DIRECTIONS[direction]
    ) return

    const currentDirection = snake.direction
    const pendingDirection =
      directionsRef.current[currentUserId] || currentDirection
    if (
      direction === pendingDirection ||
      OPPOSITE_DIRECTION[currentDirection] === direction
    ) return

    directionsRef.current[currentUserId] = direction
    if (session?.role === 'guest') {
      try {
        await writeGameMessage(
          session.conversationId,
          currentUserId,
          'game_snake_input',
          { inviteId: session.inviteId, direction }
        )
      } catch (error) {
        console.error('Snake-kommandot kunde inte skickas:', error)
        setErrorMessage(`Rörelsen kunde inte skickas: ${error.message || 'Okänt fel'}`)
        directionsRef.current[currentUserId] = snake.direction
      }
    }
  }, [currentUserId, session, writeGameMessage])

  useEffect(() => {
    function onKeyDown(event) {
      const directionByKey = {
        ArrowUp: 'up',
        w: 'up',
        ArrowRight: 'right',
        d: 'right',
        ArrowDown: 'down',
        s: 'down',
        ArrowLeft: 'left',
        a: 'left',
      }
      const direction = directionByKey[event.key]
      if (!direction || gameStateRef.current?.phase !== 'playing') return
      if (event.target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
      event.preventDefault()
      handleDirection(direction)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleDirection])

  const matchId = session?.inviteId || soloGameId
  useEffect(() => {
    if (!matchId || !gameState || scoredEventsRef.current.has(`played:${matchId}`)) return
    scoredEventsRef.current.add(`played:${matchId}`)
    Promise.resolve(onScore?.(1, `played:${matchId}`)).catch((error) => {
      scoredEventsRef.current.delete(`played:${matchId}`)
      console.error('Twist Score kunde inte uppdateras efter Snake:', error)
      setErrorMessage(`Twist Score kunde inte uppdateras: ${error.message || 'Okänt fel'}`)
    })
  }, [matchId, gameState, onScore])

  useEffect(() => {
    if (
      !matchId ||
      !gameState?.winnerId ||
      gameState.winnerId !== currentUserId ||
      scoredEventsRef.current.has(`won:${matchId}`)
    ) return
    scoredEventsRef.current.add(`won:${matchId}`)
    Promise.resolve(onScore?.(1, `won:${matchId}`)).catch((error) => {
      scoredEventsRef.current.delete(`won:${matchId}`)
      console.error('Twist Score kunde inte uppdateras efter Snake-vinst:', error)
      setErrorMessage(`Twist Score kunde inte uppdateras: ${error.message || 'Okänt fel'}`)
    })
  }, [matchId, gameState?.winnerId, currentUserId, onScore])

  function startSoloGame() {
    const nextId = ID.unique()
    setSession(null)
    setMode('solo')
    setSoloGameId(nextId)
    setErrorMessage('')
  }

  const ownSnake = gameState?.snakes.find((snake) => snake.userId === currentUserId)
  const aliveCount = gameState?.snakes.filter((snake) => snake.alive).length || 0
  const winnerName = gameState?.snakes.find(
    (snake) => snake.userId === gameState?.winnerId
  )?.username
  let statusText = 'Välj ett spelläge för att börja.'
  if (session && !gameState) {
    statusText = loadingGame
      ? 'Ansluter till spelet...'
      : 'Väntar på att spelet ska synkroniseras...'
  } else if (gameState?.phase === 'finished') {
    statusText = mode === 'solo'
      ? `Game over! Du fick ${ownSnake?.score || 0} poäng.`
      : gameState.winnerId === currentUserId
        ? 'Du vann! 🏆'
        : winnerName
          ? `@${winnerName} vann!`
          : 'Oavgjort!'
  } else if (gameState && !ownSnake?.alive) {
    statusText = `Du är ute – ${aliveCount} ${aliveCount === 1 ? 'orm' : 'ormar'} kvar.`
  } else if (gameState?.phase === 'playing') {
    statusText = `Ät maten och överlev!  ${ownSnake?.score || 0} poäng`
  }

  const occupiedCells = new Map()
  gameState?.snakes.forEach((snake) => {
    snake.body.forEach((segment, index) => {
      occupiedCells.set(`${segment.x},${segment.y}`, {
        color: snake.color,
        head: index === 0,
        alive: snake.alive,
      })
    })
  })

  return (
    <div className="snake-game">
      {!session && mode !== 'solo' && (
        <div className="snake-mode-picker">
          <div className="snake-intro">
            <span aria-hidden="true">🐍</span>
            <h2>Snake</h2>
            <p>Ät, väx och akta dig för väggar och andra ormar.</p>
          </div>
          <button type="button" onClick={startSoloGame}>
            <span aria-hidden="true">🕹️</span>
            <strong>Spela själv</strong>
            <small>Samla så många poäng du kan.</small>
          </button>
          <button type="button" onClick={onInviteFriends}>
            <span aria-hidden="true">👾</span>
            <strong>Spela med kompisar</strong>
            <small>Upp till fyra ormar på samma bana.</small>
          </button>
        </div>
      )}

      {gameState && (
        <div className="snake-match">
          <div className="snake-scoreboard" aria-label="Spelare">
            {gameState.snakes.map((snake) => (
              <div
                className={`snake-player ${snake.alive ? '' : 'is-out'}`}
                key={snake.userId}
                style={{ '--snake-color': snake.color }}
              >
                <span className="snake-player-dot" aria-hidden="true" />
                <span>
                  <strong>{snake.userId === currentUserId ? 'Du' : `@${snake.username}`}</strong>
                  <small>{snake.alive ? `${snake.score} poäng` : 'Utslagen'}</small>
                </span>
              </div>
            ))}
          </div>

          <p className="snake-status" aria-live="polite">{statusText}</p>
          <div
            className="snake-board"
            role="img"
            aria-label={`Snake-bana, ${ownSnake?.score || 0} poäng`}
            style={{ '--board-columns': BOARD_WIDTH, '--board-rows': BOARD_HEIGHT }}
          >
            {Array.from({ length: BOARD_WIDTH * BOARD_HEIGHT }, (_, index) => {
              const x = index % BOARD_WIDTH
              const y = Math.floor(index / BOARD_WIDTH)
              const snakeCell = occupiedCells.get(`${x},${y}`)
              const isFood = gameState.food?.x === x && gameState.food?.y === y
              return (
                <span
                  className={`snake-cell ${snakeCell
                    ? snakeCell.head ? 'is-head' : 'is-body'
                    : isFood ? 'is-food' : ''} ${snakeCell && !snakeCell.alive ? 'is-dead' : ''}`}
                  key={index}
                  style={snakeCell ? { '--snake-color': snakeCell.color } : undefined}
                />
              )
            })}
          </div>

          {gameState.phase === 'playing' && (
            <div className="snake-controls" aria-label="Styr ormen">
              <button type="button" aria-label="Upp" onClick={() => handleDirection('up')}>↑</button>
              <button type="button" aria-label="Vänster" onClick={() => handleDirection('left')}>←</button>
              <button type="button" aria-label="Ner" onClick={() => handleDirection('down')}>↓</button>
              <button type="button" aria-label="Höger" onClick={() => handleDirection('right')}>→</button>
            </div>
          )}
          <p className="snake-help">Styr med piltangenterna eller WASD.</p>
          {mode === 'solo' && gameState.phase === 'finished' && (
            <button type="button" className="game-primary-button" onClick={startSoloGame}>
              Spela igen
            </button>
          )}
        </div>
      )}

      {errorMessage && <p className="game-error" role="alert">{errorMessage}</p>}
      <button type="button" className="game-text-button" onClick={onBack}>
        Tillbaka till spelen
      </button>
    </div>
  )
}
