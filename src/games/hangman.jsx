import { useCallback, useEffect, useRef, useState } from 'react'
import { ID, Permission, Query, Role } from 'appwrite'

import {
  client,
  tablesDB,
  DATABASE_ID,
  MESSAGES_TABLE_ID,
} from '../lib/appwrite.js'
import './hangman.css'

const STARTING_LIVES = 6
const GAME_MESSAGE_TYPES = [
  'game_session_start',
  'game_hangman_state',
  'game_hangman_word',
  'game_hangman_guess',
  'game_hangman_replay',
]

function parseMessage(message) {
  try {
    return JSON.parse(message.text)
  } catch (error) {
    console.error('Ogiltigt Hangman-meddelande:', error)
    return null
  }
}

function normalizeWord(value) {
  if (typeof value !== 'string') return null
  const word = value.trim().normalize('NFC').toLocaleLowerCase('sv-SE')
  if (
    !word ||
    Array.from(word).length > 50 ||
    !/^[a-zåäö]+(?:[ -][a-zåäö]+)*$/i.test(word)
  ) {
    return null
  }
  return word
}

function makeMask(word, guessedLetters = []) {
  return Array.from(word, (letter) =>
    letter === ' ' || letter === '-' || guessedLetters.includes(letter)
      ? letter
      : '_'
  )
}

function hasWon(mask) {
  return !mask.includes('_')
}

function initialRound(inviteId, round, chooserId, players) {
  return {
    inviteId,
    round,
    chooserId,
    playerIds: players.map((player) => player.userId),
    phase: 'choosing',
    mask: [],
    usedLetters: [],
    lives: STARTING_LIVES,
    winnerId: null,
    answer: null,
  }
}

function getPlayerName(session, userId) {
  return session?.players?.find((player) => player.userId === userId)?.username ||
    (userId === session?.hostUserId ? 'Hosten' : 'Spelaren')
}

export default function Hangman({
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
  const [gameState, setGameState] = useState(null)
  const [wordInput, setWordInput] = useState('')
  const [guessInput, setGuessInput] = useState('')
  const [guessMode, setGuessMode] = useState('letter')
  const [errorMessage, setErrorMessage] = useState('')
  const [sendingAction, setSendingAction] = useState(false)
  const [loadingGame, setLoadingGame] = useState(Boolean(initialInvite))
  const sessionRef = useRef(session)
  const gameStateRef = useRef(gameState)
  const wordRef = useRef('')
  const processedMessageIds = useRef(new Set())
  const actionQueue = useRef(Promise.resolve())
  const startApplied = useRef(null)
  const scoredEventsRef = useRef(new Set())

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

  const setCurrentState = useCallback((nextState) => {
    gameStateRef.current = nextState
    setGameState(nextState)
  }, [])

  useEffect(() => {
    setCurrentState(null)
    wordRef.current = ''
    processedMessageIds.current.clear()
  }, [session?.inviteId, setCurrentState])

  useEffect(() => {
    if (!onlineSession) return
    setSession(onlineSession)
  }, [onlineSession])

  const writeGameMessage = useCallback(async (
    recipient,
    senderId,
    type,
    data
  ) => {
    const activeSession = sessionRef.current
    if (!activeSession || !recipient?.conversationId) {
      throw new Error('Spelkonversationen saknas.')
    }

    return tablesDB.createRow({
      databaseId: DATABASE_ID,
      tableId: MESSAGES_TABLE_ID,
      rowId: ID.unique(),
      data: {
        conversationId: recipient.conversationId,
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

  const broadcastState = useCallback(async (nextState) => {
    setCurrentState(nextState)
    const activeSession = sessionRef.current
    const recipients = activeSession?.players?.filter(
      (player) => player.userId !== activeSession.hostUserId && player.conversationId
    ) || []

    await Promise.all(recipients.map((recipient) =>
      writeGameMessage(
        recipient,
        activeSession.hostUserId,
        'game_hangman_state',
        { inviteId: activeSession.inviteId, state: nextState }
      )
    ))
  }, [setCurrentState, writeGameMessage])

  const processHostAction = useCallback(async (message) => {
    if (!message?.$id || processedMessageIds.current.has(message.$id)) return

    const activeSession = sessionRef.current
    const activeState = gameStateRef.current
    const content = parseMessage(message)
    if (
      activeSession?.role !== 'host' ||
      !activeState ||
      content?.inviteId !== activeSession.inviteId ||
      content.round !== activeState.round
    ) return
    processedMessageIds.current.add(message.$id)

    if (message.type === 'game_hangman_word') {
      if (
        activeState.phase !== 'choosing' ||
        message.senderId !== activeState.chooserId
      ) return
      const word = normalizeWord(content.word || '')
      if (!word) return

      wordRef.current = word
      const nextState = {
        ...activeState,
        phase: 'playing',
        mask: makeMask(word),
      }
      await broadcastState(nextState)
      return
    }

    if (message.type === 'game_hangman_replay') {
      if (
        activeState.phase !== 'finished' ||
        !activeState.winnerId ||
        !activeState.playerIds.includes(message.senderId)
      ) return
      wordRef.current = ''
      await broadcastState(initialRound(
        activeSession.inviteId,
        activeState.round + 1,
        activeState.winnerId,
        activeSession.players
      ))
      return
    }

    if (
      message.type !== 'game_hangman_guess' ||
      activeState.phase !== 'playing' ||
      message.senderId === activeState.chooserId ||
      !activeState.playerIds.includes(message.senderId) ||
      !wordRef.current
    ) return

    const word = wordRef.current
    const guess = (typeof content.guess === 'string' ? content.guess : '')
      .trim()
      .normalize('NFC')
      .toLocaleLowerCase('sv-SE')
    let nextState = activeState

    if (content.mode === 'letter') {
      if (!/^[a-zåäö]$/i.test(guess) || activeState.usedLetters.includes(guess)) return
      const usedLetters = [...activeState.usedLetters, guess]
      if (word.includes(guess)) {
        const mask = makeMask(word, usedLetters)
        nextState = hasWon(mask)
          ? {
            ...activeState,
            mask,
            usedLetters,
            phase: 'finished',
            winnerId: message.senderId,
            answer: word,
          }
          : { ...activeState, mask, usedLetters }
      } else {
        const lives = activeState.lives - 1
        nextState = lives <= 0
          ? {
            ...activeState,
            usedLetters,
            lives: 0,
            phase: 'finished',
            winnerId: activeState.chooserId,
            answer: word,
          }
          : { ...activeState, usedLetters, lives }
      }
    } else if (content.mode === 'word') {
      const normalizedGuess = normalizeWord(guess)
      if (!normalizedGuess) return
      if (normalizedGuess === word) {
        nextState = {
          ...activeState,
          mask: makeMask(word, Array.from(word)),
          phase: 'finished',
          winnerId: message.senderId,
          answer: word,
        }
      } else {
        const lives = activeState.lives - 1
        nextState = lives <= 0
          ? {
            ...activeState,
            lives: 0,
            phase: 'finished',
            winnerId: activeState.chooserId,
            answer: word,
          }
          : { ...activeState, lives }
      }
    } else {
      return
    }

    await broadcastState(nextState)
  }, [broadcastState])

  const enqueueHostAction = useCallback((message) => {
    actionQueue.current = actionQueue.current
      .then(() => processHostAction(message))
      .catch((error) => {
        console.error('Hangman-händelsen kunde inte behandlas:', error)
        setErrorMessage(`Spelet kunde inte uppdateras: ${error.message || 'Okänt fel'}`)
      })
  }, [processHostAction])

  useEffect(() => {
    if (!initialInvite?.inviteId || onlineSession || !currentUserId) return

    let cancelled = false
    const ownConversationId = initialInvite.conversationId

    function applyStartMessage(message) {
      const start = parseMessage(message)
      if (
        start?.inviteId !== initialInvite.inviteId ||
        startApplied.current === initialInvite.inviteId
      ) return
      startApplied.current = initialInvite.inviteId
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
        const startMessage = response.rows.find((message) => {
          const content = parseMessage(message)
          return content?.inviteId === initialInvite.inviteId
        })
        if (!startMessage || cancelled) return
        applyStartMessage(startMessage)
      } catch (error) {
        console.error('Hangman-sessionen kunde inte hämtas:', error)
        setErrorMessage(
          `Spelet kunde inte hämtas: ${error.message || 'Okänt fel'}`
        )
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
    if (!session?.inviteId || !session.players?.length) return

    let cancelled = false
    async function initializeSession() {
      setLoadingGame(true)
      try {
        const conversations = session.role === 'host'
          ? session.players
            .filter((player) => player.conversationId)
            .map((player) => player.conversationId)
          : [session.conversationId].filter(Boolean)
        const responses = await Promise.all(conversations.map((conversationId) =>
          tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: MESSAGES_TABLE_ID,
            queries: [
              Query.equal('conversationId', [conversationId]),
              Query.equal('type', GAME_MESSAGE_TYPES),
              Query.orderDesc('$createdAt'),
              Query.limit(500),
            ],
          })
        ))
        if (cancelled) return

        const messages = responses.flatMap((response) => response.rows)
          .filter((message) => parseMessage(message)?.inviteId === session.inviteId)
          .sort((a, b) => a.$createdAt.localeCompare(b.$createdAt))

        if (session.role === 'host') {
          const latestStateMessage = [...messages].reverse().find(
            (message) => message.type === 'game_hangman_state'
          )
          const latestState = latestStateMessage
            ? parseMessage(latestStateMessage).state
            : null
          if (latestState) {
            setCurrentState(latestState)
            const secret = [...messages].reverse().find((message) => {
              const content = parseMessage(message)
              return (
                message.type === 'game_hangman_word' &&
                content?.round === latestState.round
              )
            })
            if (secret) wordRef.current = parseMessage(secret).word
          } else {
            const firstState = initialRound(
              session.inviteId,
              1,
              session.wordChooserId,
              session.players
            )
            await broadcastState(firstState)
          }
        } else {
          const ownStateMessage = [...messages].reverse().find(
            (message) => message.type === 'game_hangman_state'
          )
          if (ownStateMessage) {
            setCurrentState(parseMessage(ownStateMessage).state)
          }
        }
      } catch (error) {
        console.error('Hangman-statusen kunde inte hämtas:', error)
        setErrorMessage(
          `Spelet kunde inte synkroniseras: ${error.message || 'Okänt fel'}`
        )
      } finally {
        if (!cancelled) setLoadingGame(false)
      }
    }

    initializeSession()
    return () => {
      cancelled = true
    }
  }, [session?.inviteId, session?.role, session?.players, broadcastState, setCurrentState])

  useEffect(() => {
    if (!session?.inviteId) return

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${MESSAGES_TABLE_ID}.rows`,
      ({ payload }) => {
        if (!payload) return
        if (session.role === 'host') {
          if (payload.senderId === session.hostUserId) return
          if (
            payload.type === 'game_hangman_word' ||
            payload.type === 'game_hangman_guess' ||
            payload.type === 'game_hangman_replay'
          ) {
            enqueueHostAction(payload)
          }
          return
        }
        if (
          payload.conversationId === session.conversationId &&
          payload.type === 'game_hangman_state'
        ) {
          const content = parseMessage(payload)
          if (content?.inviteId === session.inviteId && content.state) {
            setCurrentState(content.state)
          }
        }
      }
    )
    return () => unsubscribe()
  }, [session, enqueueHostAction, setCurrentState])

  async function sendAction(type, data) {
    if (!session || sendingAction) return
    const recipient = session.role === 'host'
      ? session.players.find((player) =>
        player.userId !== session.hostUserId && player.conversationId
      )
      : session.players.find((player) => player.userId === currentUserId) || {
        userId: currentUserId,
        conversationId: session.conversationId,
      }
    if (!recipient?.conversationId) {
      setErrorMessage('Spelkonversationen kunde inte hittas.')
      return
    }

    setSendingAction(true)
    setErrorMessage('')
    try {
      const typeByAction = {
        word: 'game_hangman_word',
        guess: 'game_hangman_guess',
        replay: 'game_hangman_replay',
      }
      const message = await writeGameMessage(
        recipient,
        currentUserId,
        typeByAction[type],
        {
          inviteId: session.inviteId,
          round: gameStateRef.current?.round,
          ...data,
        }
      )
      if (session.role === 'host') {
        await processHostAction(message)
      }
    } catch (error) {
      console.error('Hangman-händelsen kunde inte skickas:', error)
      setErrorMessage(
        `Spelet kunde inte uppdateras: ${error.message || 'Okänt fel'}`
      )
    } finally {
      setSendingAction(false)
    }
  }

  async function submitWord(event) {
    event.preventDefault()
    const word = normalizeWord(wordInput)
    if (!word) {
      setErrorMessage('Skriv ett ord med bokstäver, mellanslag eller bindestreck.')
      return
    }
    await sendAction('word', { word })
    setWordInput('')
  }

  async function submitGuess(event) {
    event.preventDefault()
    const guess = guessInput.trim().normalize('NFC').toLocaleLowerCase('sv-SE')
    if (
      guessMode === 'letter'
        ? !/^[a-zåäö]$/i.test(guess)
        : !normalizeWord(guess)
    ) {
      setErrorMessage(
        guessMode === 'letter'
          ? 'Skriv en bokstav i taget.'
          : 'Skriv ett helt ord.'
      )
      return
    }
    if (guessMode === 'letter' && gameState?.usedLetters.includes(guess)) {
      setErrorMessage('Den bokstaven är redan gissad.')
      return
    }
    await sendAction('guess', { mode: guessMode, guess })
    setGuessInput('')
  }

  const chooserName = getPlayerName(session, gameState?.chooserId)
  const winnerName = getPlayerName(session, gameState?.winnerId)
  const isChooser = gameState?.chooserId === currentUserId
  const canGuess = Boolean(
    gameState?.phase === 'playing' &&
    gameState.chooserId !== currentUserId &&
    gameState.playerIds.includes(currentUserId)
  )

  function awardScore(eventId) {
    if (!onScore || scoredEventsRef.current.has(eventId)) return
    scoredEventsRef.current.add(eventId)
    Promise.resolve(onScore(1, eventId)).catch((error) => {
      scoredEventsRef.current.delete(eventId)
      console.error('Twist Score kunde inte uppdateras efter Hangman:', error)
      setErrorMessage(
        `Twist Score kunde inte uppdateras: ${error.message || 'Okänt fel'}`
      )
    })
  }

  useEffect(() => {
    if (!session?.inviteId || !gameState) return
    awardScore(`played:${session.inviteId}`)
  }, [session?.inviteId, gameState, onScore])

  useEffect(() => {
    if (
      gameState?.phase !== 'finished' ||
      gameState.winnerId !== currentUserId ||
      !session?.inviteId
    ) return
    awardScore(`won:${session.inviteId}:${gameState.round}`)
  }, [
    gameState?.phase,
    gameState?.winnerId,
    gameState?.round,
    currentUserId,
    session?.inviteId,
    onScore,
  ])

  return (
    <div className="hangman">
      {loadingGame && <p className="hangman-status">Synkroniserar spelet...</p>}
      {!session && !loadingGame && (
        <>
          <p className="hangman-status">
            {errorMessage || 'Bjud in kompisar för att starta Hangman.'}
          </p>
          <button
            type="button"
            className="game-primary-button"
            onClick={onInviteFriends}
          >
            Bjud in kompisar
          </button>
        </>
      )}
      {session && !gameState && (
        <p className="hangman-status">Väntar på spelstatus...</p>
      )}
      {session && gameState && (
        <>
          <p className="hangman-status">
            Omgång {gameState.round} · {gameState.phase === 'choosing'
              ? `@${chooserName} väljer ord`
              : gameState.phase === 'playing'
                ? `@${chooserName} valde ordet`
                : gameState.winnerId === gameState.chooserId
                  ? `@${winnerName} vann — gissarlaget förlorade`
                  : `@${winnerName} vann!`}
          </p>

          <div className="hangman-board">
            <div className="hangman-word" aria-label="Det hemliga ordet">
              {gameState.mask.map((letter, index) => (
                <span
                  className={`hangman-letter ${letter === ' ' || letter === '-' ? 'is-space' : ''}`}
                  key={`${gameState.round}-${index}`}
                >
                  {letter === '_' ? '_' : letter}
                </span>
              ))}
              {gameState.phase === 'choosing' && !gameState.mask.length && (
                <span className="hangman-waiting-word">Ord visas när det är valt</span>
              )}
            </div>
            <div
              className="hangman-candles"
              aria-label={`${gameState.lives} av ${STARTING_LIVES} liv kvar`}
            >
              {Array.from({ length: STARTING_LIVES }, (_, index) => (
                <span
                  className={`hangman-candle ${index < gameState.lives ? 'is-lit' : 'is-out'}`}
                  aria-hidden="true"
                  key={index}
                >
                  🕯️
                </span>
              ))}
              <small>{gameState.lives}/{STARTING_LIVES} liv</small>
            </div>
          </div>

          {gameState.usedLetters.length > 0 && (
            <p className="hangman-used-letters">
              Gissade bokstäver: {gameState.usedLetters.map((letter) =>
                letter.toLocaleUpperCase('sv-SE')
              ).join(', ')}
            </p>
          )}

          {gameState.phase === 'choosing' && isChooser && (
            <form className="hangman-form" onSubmit={submitWord}>
              <label htmlFor="hangman-word">Välj ett ord</label>
              <input
                id="hangman-word"
                value={wordInput}
                onChange={(event) => setWordInput(event.target.value)}
                maxLength={50}
                autoComplete="off"
                disabled={sendingAction}
              />
              <button type="submit" className="game-primary-button" disabled={sendingAction}>
                {sendingAction ? 'Skickar...' : 'Visa ordlängden'}
              </button>
            </form>
          )}
          {gameState.phase === 'choosing' && !isChooser && (
            <p className="hangman-status">Väntar på att @{chooserName} väljer ordet...</p>
          )}

          {canGuess && (
            <form className="hangman-form" onSubmit={submitGuess}>
              <div className="hangman-guess-modes" role="group" aria-label="Typ av gissning">
                <button
                  type="button"
                  className={guessMode === 'letter' ? 'is-active' : ''}
                  onClick={() => {
                    setGuessMode('letter')
                    setGuessInput('')
                    setErrorMessage('')
                  }}
                >
                  Gissa bokstav
                </button>
                <button
                  type="button"
                  className={guessMode === 'word' ? 'is-active' : ''}
                  onClick={() => {
                    setGuessMode('word')
                    setGuessInput('')
                    setErrorMessage('')
                  }}
                >
                  Gissa hela ordet
                </button>
              </div>
              <label htmlFor="hangman-guess">
                {guessMode === 'letter' ? 'Vilken bokstav?' : 'Vilket ord?'}
              </label>
              <input
                id="hangman-guess"
                value={guessInput}
                onChange={(event) => setGuessInput(event.target.value)}
                maxLength={guessMode === 'letter' ? 1 : 50}
                autoComplete="off"
                disabled={sendingAction}
              />
              <button type="submit" className="game-primary-button" disabled={sendingAction}>
                {sendingAction ? 'Gissar...' : 'Gissa'}
              </button>
            </form>
          )}
          {gameState.phase === 'playing' && !canGuess && (
            <p className="hangman-status">Ordväljaren kan inte gissa på sitt eget ord.</p>
          )}

          {gameState.phase === 'finished' && (
            <div className="hangman-finished">
              <p>
                {gameState.winnerId === gameState.chooserId
                  ? 'Alla ljus slocknade. Gissarlaget förlorade.'
                  : 'Rätt gissat! Gissarlaget vann.'}
              </p>
              <p>Ordet var <strong>{gameState.answer}</strong>.</p>
              <p>Nästa ord väljs av @{winnerName}.</p>
              <button
                type="button"
                className="game-primary-button"
                onClick={() => sendAction('replay', {})}
                disabled={sendingAction}
              >
                {sendingAction ? 'Startar...' : 'Spela en omgång till'}
              </button>
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
