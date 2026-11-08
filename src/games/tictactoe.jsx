import { useCallback, useEffect, useMemo, useState } from 'react'
import { ID, Permission, Query, Role } from 'appwrite'

import {
  client,
  tablesDB,
  DATABASE_ID,
  CONVERSATIONS_TABLE_ID,
  CONVERSATION_MEMBERS_TABLE_ID,
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
  friends,
  initialInvite,
  loadingFriends,
  friendsError,
  onBack,
}) {
  const currentUserId = currentUser?.$id
  const [session, setSession] = useState(() => initialInvite
    ? {
      ...initialInvite,
      role: 'guest',
      hostUserId: initialInvite.fromUserId,
      opponentUserId: currentUser?.$id,
      opponentName: initialInvite.fromName || 'Din kompis',
    }
    : null)
  const [mode, setMode] = useState(null)
  const [board, setBoard] = useState(Array(9).fill(null))
  const [moves, setMoves] = useState([])
  const [accepted, setAccepted] = useState(Boolean(initialInvite))
  const [loadingGame, setLoadingGame] = useState(false)
  const [sendingMove, setSendingMove] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const winner = getWinner(board)
  const isDraw = board.every(Boolean) && !winner
  const nextSymbol = board.filter(Boolean).length % 2 === 0 ? 'X' : 'O'
  const isMyTurn = mode === 'bot'
    ? nextSymbol === 'X'
    : session?.role === 'host'
      ? nextSymbol === 'X'
      : nextSymbol === 'O'

  const updateOnlineGame = useCallback(async () => {
    if (!session?.conversationId || !session.inviteId) return
    setLoadingGame(true)

    try {
      const response = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: MESSAGES_TABLE_ID,
        queries: [
          Query.equal('conversationId', [session.conversationId]),
          Query.equal('type', ['game_move', 'game_invite_response']),
          Query.orderDesc('$createdAt'),
          Query.limit(500),
        ],
      })
      const relevantMessages = response.rows.filter((message) => {
        if (message.type !== 'game_move' &&
          message.type !== 'game_invite_response') return false
        return parseMessage(message)?.inviteId === session.inviteId
      })
      const acceptedResponse = relevantMessages.some((message) =>
        message.type === 'game_invite_response' &&
        parseMessage(message)?.status === 'accepted'
      )
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
  }, [session])

  useEffect(() => {
    if (!session?.conversationId) return

    updateOnlineGame()
    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${MESSAGES_TABLE_ID}.rows`,
      ({ payload }) => {
        if (
          payload?.conversationId === session.conversationId &&
          (payload.type === 'game_move' ||
            payload.type === 'game_invite_response')
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

  async function sendInvitation(friend) {
    if (!currentUserId || !friend?.userId) return
    setErrorMessage('')

    try {
      const conversation = await ensureDirectConversation(
        currentUserId,
        friend.userId
      )
      const inviteId = ID.unique()
      const invite = {
        inviteId,
        gameId: 'tic-tac-toe',
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
      setSession({
        ...invite,
        conversationId: conversation.$id,
        role: 'host',
        hostUserId: currentUserId,
        opponentUserId: friend.userId,
        opponentName: friend.username,
      })
      setAccepted(false)
    } catch (error) {
      console.error('Spelinbjudan kunde inte skickas:', error)
      setErrorMessage(
        `Spelinbjudan kunde inte skickas: ${error.message || 'Okänt fel'}`
      )
    }
  }

  async function makeOnlineMove(cell) {
    if (
      !session ||
      !accepted ||
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

  function restartBotGame() {
    setBoard(Array(9).fill(null))
  }

  const statusText = useMemo(() => {
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
  }, [winner, mode, session, isDraw, nextSymbol, accepted, isMyTurn])

  return (
    <div className="tic-tac-toe">
      {!session && !mode && (
        <div className="game-mode-picker">
          <p>Välj hur du vill spela</p>
          <button type="button" onClick={() => setMode('bot')}>
            <span aria-hidden="true">🤖</span>
            <strong>Spela mot bot</strong>
            <small>En klurig motståndare, direkt här.</small>
          </button>
          <button type="button" onClick={() => setMode('friend-select')}>
            <span aria-hidden="true">👯</span>
            <strong>Spela med kompis</strong>
            <small>Bjud in en kompis till en match.</small>
          </button>
        </div>
      )}

      {!session && mode === 'friend-select' && (
        <div className="game-friend-picker">
          <h2>Välj en kompis</h2>
          {loadingFriends && <p>Laddar kompisar...</p>}
          {friendsError && <p className="game-error" role="alert">{friendsError}</p>}
          {!loadingFriends && !friendsError && friends.length === 0 && (
            <p>Du har inga accepterade kompisar att bjuda in ännu.</p>
          )}
          {friends.map((friend) => (
            <button
              type="button"
              className="game-friend-option"
              key={friend.userId}
              onClick={() => sendInvitation(friend)}
            >
              <span className="game-friend-avatar">
                {friend.username.slice(0, 1).toUpperCase()}
              </span>
              <strong>@{friend.username}</strong>
              <span>Skicka inbjudan</span>
            </button>
          ))}
          <button
            type="button"
            className="game-text-button"
            onClick={() => setMode(null)}
          >
            Tillbaka
          </button>
        </div>
      )}

      {(session || mode === 'bot') && (
        <div className="tic-tac-toe-match">
          {session && (
            <p className="game-opponent">
              {session.role === 'host'
                ? `Du spelar mot ${session.opponentName}`
                : `Du spelar mot ${session.opponentName}`}
            </p>
          )}
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
                  (mode === 'bot' ? !isMyTurn : !accepted || !isMyTurn || sendingMove)
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
