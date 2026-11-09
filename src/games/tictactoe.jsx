import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ID, Permission, Query, Role } from 'appwrite'

import {
  client,
  tablesDB,
  DATABASE_ID,
  MESSAGES_TABLE_ID,
} from '../lib/appwrite.js'
import './tictactoe.css'

function getWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ]

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]
    }
  }
  return null
}

function minimax(board, player) {
  const winner = getWinner(board)
  if (winner === 'O') return { score: 10 }
  if (winner === 'X') return { score: -10 }
  if (board.every(Boolean)) return { score: 0 }

  const moves = []
  board.forEach((cell, index) => {
    if (cell) return
    const nextBoard = [...board]
    nextBoard[index] = player
    moves.push({
      index,
      score: minimax(nextBoard, player === 'O' ? 'X' : 'O').score,
    })
  })

  return moves.reduce((best, move) => {
    if (!best) return move
    return player === 'O'
      ? move.score > best.score ? move : best
      : move.score < best.score ? move : best
  }, null)
}

function parseMessage(message) {
  try {
    return JSON.parse(message.text)
  } catch (error) {
    console.error('Ogiltigt spelmeddelande:', error)
    return null
  }
}

export default function TicTacToe({
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
      opponentUserId: currentUser?.$id,
      opponentName: initialInvite.fromName || 'Din kompis',
    }
    : null))
  const [mode, setMode] = useState(null)
  const [board, setBoard] = useState(Array(9).fill(null))
  const [moves, setMoves] = useState([])
  const [accepted, setAccepted] = useState(Boolean(initialInvite))
  const [startState, setStartState] = useState(
    onlineSession ? 'started' : initialInvite ? 'waiting' : null
  )
  const [loadingGame, setLoadingGame] = useState(false)
  const [sendingMove, setSendingMove] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [botGameId, setBotGameId] = useState(null)
  const scoredEventsRef = useRef(new Set())
  const winner = getWinner(board)
  const isDraw = board.every(Boolean) && !winner
  const nextSymbol = board.filter(Boolean).length % 2 === 0 ? 'X' : 'O'
  const isMyTurn = mode === 'bot'
    ? nextSymbol === 'X'
    : session?.role === 'host'
      ? nextSymbol === 'X'
      : nextSymbol === 'O'

  function awardScore(eventId) {
    if (!onScore || scoredEventsRef.current.has(eventId)) return
    scoredEventsRef.current.add(eventId)
    Promise.resolve(onScore(1, eventId)).catch((error) => {
      scoredEventsRef.current.delete(eventId)
      console.error('Twist Score kunde inte uppdateras efter spelet:', error)
      setErrorMessage(
        `Twist Score kunde inte uppdateras: ${error.message || 'Okänt fel'}`
      )
    })
  }

  useEffect(() => {
    const gameId = mode === 'bot' ? botGameId : session?.inviteId
    const hasStarted = mode === 'bot' ||
      Boolean(session && accepted && startState === 'started')

    if (gameId && hasStarted) awardScore(`played:${gameId}`)
  }, [mode, botGameId, session?.inviteId, accepted, startState, onScore])

  useEffect(() => {
    if (!winner) return

    const isLocalWinner = mode === 'bot'
      ? winner === 'X'
      : winner === (session?.role === 'host' ? 'X' : 'O')
    const gameId = mode === 'bot' ? botGameId : session?.inviteId

    if (isLocalWinner && gameId) awardScore(`won:${gameId}`)
  }, [winner, mode, botGameId, session?.inviteId, session?.role, onScore])

  useEffect(() => {
    if (!onlineSession) return
    setSession(onlineSession)
    setStartState('started')
  }, [onlineSession])

  const updateOnlineGame = useCallback(async () => {
    if (!session?.conversationId || !session.inviteId) return
    setLoadingGame(true)

    try {
      const response = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: MESSAGES_TABLE_ID,
        queries: [
          Query.equal('conversationId', [session.conversationId]),
          Query.equal('type', [
            'game_move',
            'game_invite_response',
            'game_session_start',
          ]),
          Query.orderDesc('$createdAt'),
          Query.limit(500),
        ],
      })
      const relevantMessages = response.rows.filter((message) => {
        if (message.type !== 'game_move' &&
          message.type !== 'game_invite_response' &&
          message.type !== 'game_session_start') return false
        return parseMessage(message)?.inviteId === session.inviteId
      })
      const acceptedResponse = relevantMessages.some((message) =>
        message.type === 'game_invite_response' &&
        parseMessage(message)?.status === 'accepted'
      )
      const startMessage = relevantMessages.find((message) =>
        message.type === 'game_session_start' &&
        parseMessage(message)?.startedBy === session.hostUserId
      )
      const startContent = startMessage ? parseMessage(startMessage) : null
      const onlineMoves = relevantMessages
        .filter((message) => message.type === 'game_move')
        .map((message) => ({
          ...parseMessage(message),
          senderId: message.senderId,
          $createdAt: message.$createdAt,
        }))
        .filter((move) =>
          Number.isInteger(move.cell) &&
          move.cell >= 0 &&
          move.cell < 9 &&
          (move.symbol === 'X' || move.symbol === 'O')
        )
        .sort((a, b) => a.$createdAt.localeCompare(b.$createdAt))
      const legalMoves = []
      const moveBoard = Array(9).fill(null)
      onlineMoves.forEach((move) => {
        const expectedSymbol = legalMoves.length % 2 === 0 ? 'X' : 'O'
        const expectedPlayerId = expectedSymbol === 'X'
          ? session.hostUserId
          : session.opponentUserId

        if (
          move.symbol !== expectedSymbol ||
          move.senderId !== expectedPlayerId ||
          moveBoard[move.cell] ||
          getWinner(moveBoard)
        ) {
          return
        }

        moveBoard[move.cell] = move.symbol
        legalMoves.push(move)
      })

      setAccepted(acceptedResponse || session.role === 'guest')
      if (session.role === 'host') {
        setStartState('started')
      } else if (startContent) {
        setStartState(startContent.playerIds?.includes(currentUserId)
          ? 'started'
          : 'excluded')
      } else {
        setStartState('waiting')
      }
      setMoves(legalMoves)
      setErrorMessage('')
    } catch (error) {
      console.error('Kunde inte uppdatera spelet:', error)
      setErrorMessage(
        `Spelet kunde inte uppdateras: ${error.message || 'Okänt fel'}`
      )
    } finally {
      setLoadingGame(false)
    }
  }, [session, currentUserId])

  useEffect(() => {
    if (!session?.conversationId) return

    updateOnlineGame()
    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${MESSAGES_TABLE_ID}.rows`,
      ({ payload }) => {
        if (
          payload?.conversationId === session.conversationId &&
          (payload.type === 'game_move' ||
            payload.type === 'game_invite_response' ||
            payload.type === 'game_session_start')
        ) {
          updateOnlineGame()
        }
      }
    )
    return () => unsubscribe()
  }, [session?.conversationId, session?.inviteId, updateOnlineGame])

  useEffect(() => {
    if (mode === 'bot') {
      setBoard(Array(9).fill(null))
      return
    }
    if (!session) return

    const nextBoard = Array(9).fill(null)
    moves.forEach((move) => {
      if (!nextBoard[move.cell]) nextBoard[move.cell] = move.symbol
    })
    setBoard(nextBoard)
  }, [mode, moves, session])

  useEffect(() => {
    if (mode !== 'bot' || nextSymbol !== 'O' || winner || isDraw) return
    const timer = window.setTimeout(() => {
      const move = minimax(board, 'O')
      if (!Number.isInteger(move?.index)) return
      setBoard((previous) => {
        if (previous[move.index] || getWinner(previous)) return previous
        const next = [...previous]
        next[move.index] = 'O'
        return next
      })
    }, 350)

    return () => window.clearTimeout(timer)
  }, [mode, board, nextSymbol, winner, isDraw])

  async function makeOnlineMove(cell) {
    if (
      !session ||
      !accepted ||
      startState !== 'started' ||
      !isMyTurn ||
      board[cell] ||
      winner ||
      isDraw ||
      sendingMove
    ) return

    setSendingMove(true)
    setErrorMessage('')
    const symbol = session.role === 'host' ? 'X' : 'O'

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
            cell,
            symbol,
          }),
          type: 'game_move',
        },
        permissions: [
          Permission.read(Role.users()),
          Permission.update(Role.user(currentUserId)),
          Permission.delete(Role.user(currentUserId)),
        ],
      })
      await updateOnlineGame()
    } catch (error) {
      console.error('Draget kunde inte sparas:', error)
      setErrorMessage(`Draget kunde inte sparas: ${error.message || 'Okänt fel'}`)
    } finally {
      setSendingMove(false)
    }
  }

  function makeBotMove(cell) {
    if (!isMyTurn || board[cell] || winner || isDraw) return
    setBoard((previous) => {
      if (previous[cell] || getWinner(previous)) return previous
      const next = [...previous]
      next[cell] = 'X'
      return next
    })
  }

  function startBotGame() {
    setBotGameId(ID.unique())
    setMode('bot')
    setBoard(Array(9).fill(null))
  }

  function restartBotGame() {
    setBotGameId(ID.unique())
    setBoard(Array(9).fill(null))
  }

  const statusText = useMemo(() => {
    if (session?.role === 'guest' && startState === 'excluded') {
      return 'Spelet har redan startat utan dig.'
    }
    if (session?.role === 'guest' && startState !== 'started') {
      return 'Väntar på att hosten startar spelet...'
    }
    if (winner) {
      if (mode === 'bot') return winner === 'X' ? 'Du vann!' : 'Boten vann!'
      return winner === (session?.role === 'host' ? 'X' : 'O')
        ? 'Du vann!'
        : `${session?.opponentName || 'Din kompis'} vann!`
    }
    if (isDraw) return 'Oavgjort!'
    if (mode === 'bot') return nextSymbol === 'X' ? 'Din tur' : 'Boten tänker...'
    if (!accepted) return 'Väntar på att kompisen ska acceptera...'
    return isMyTurn ? 'Din tur' : `${session?.opponentName || 'Kompisen'}s tur`
  }, [winner, mode, session, isDraw, nextSymbol, accepted, isMyTurn, startState])

  return (
    <div className="tic-tac-toe">
      {!session && !mode && (
        <div className="game-mode-picker">
          <p>Välj hur du vill spela</p>
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
      )}

      {(session || mode === 'bot') && (
        <div className="tic-tac-toe-match">
          <p className={`game-status ${!accepted && session ? 'waiting' : ''}`}>
            {statusText}
          </p>
          <div className="tic-tac-toe-board" role="grid" aria-label="Tic-tac-toe">
            {board.map((cell, index) => (
              <button
                type="button"
                role="gridcell"
                key={index}
                className={`tic-tac-toe-cell ${cell ? `mark-${cell.toLowerCase()}` : ''}`}
                onClick={() => mode === 'bot'
                  ? makeBotMove(index)
                  : makeOnlineMove(index)}
                disabled={
                  Boolean(cell) ||
                  Boolean(winner) ||
                  isDraw ||
                  (mode === 'bot'
                    ? !isMyTurn
                    : !accepted || startState !== 'started' || !isMyTurn || sendingMove)
                }
                aria-label={`Ruta ${index + 1}${cell ? `: ${cell}` : ''}`}
              >
                {cell}
              </button>
            ))}
          </div>
          {session && loadingGame && <small>Synkroniserar...</small>}
          {mode === 'bot' && (winner || isDraw) && (
            <button
              type="button"
              className="game-primary-button"
              onClick={restartBotGame}
            >
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
