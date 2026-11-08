import { useCallback, useEffect, useRef, useState } from 'react'
import { ID, Query, Permission, Role } from 'appwrite'
import { Camera as CameraIcon } from 'lucide-react'

import {
  client,
  tablesDB,
  DATABASE_ID,
  MESSAGES_TABLE_ID,
} from './lib/appwrite.js'

import TwistMessage from './TwistMessage.jsx'
import Camera from './Camera.jsx'
import ProfileAvatar from './components/ProfileAvatar.jsx'
import './Chat.css'

export default function Chat({ chat, currentUser, onRead }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [deletingMessageId, setDeletingMessageId] = useState(null)
  const [editingMessageId, setEditingMessageId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [messageMenu, setMessageMenu] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [newMessagesCount, setNewMessagesCount] = useState(0)
  const [showTwistCamera, setShowTwistCamera] = useState(false)
  const [acceptingGameInviteId, setAcceptingGameInviteId] = useState(null)

  const messagesListRef = useRef(null)
  const knownMessageIdsRef = useRef(new Set())
  const initialPositionDoneRef = useRef(false)
  const shouldAutoScrollRef = useRef(false)
  const isAtBottomRef = useRef(true)
  const readUpdateQueueRef = useRef(Promise.resolve())

  // Den här positionen ska vara oförändrad under just den här öppningen.
  // Appens lastReadAt uppdateras medan man läser, men ska inte flytta
  // startpositionen mitt i chatten.
  const initialLastReadAtRef = useRef(chat?.lastReadAt || null)
  const lastReadAtRef = useRef(chat?.lastReadAt || null)

  const conversationId = chat?.id
  const currentUserId = currentUser?.$id
  const membershipRowId = chat?.membershipRowId

  const loadMessages = useCallback(async () => {
    if (!conversationId) return

    try {
      const lastReadAt = initialLastReadAtRef.current
      let rows = []

      if (lastReadAt) {
        // Hämta lite historik före senaste lästa meddelandet och sedan
        // meddelandena efter det. Då kan vi återställa rätt position även
        // om chatten innehåller fler än 100 meddelanden totalt.
        const [beforeResponse, afterResponse] = await Promise.all([
          tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: MESSAGES_TABLE_ID,
            queries: [
              Query.equal('conversationId', [conversationId]),
              Query.lessThanEqual('$createdAt', lastReadAt),
              Query.orderDesc('$createdAt'),
              Query.limit(30),
            ],
          }),
          tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: MESSAGES_TABLE_ID,
            queries: [
              Query.equal('conversationId', [conversationId]),
              Query.greaterThan('$createdAt', lastReadAt),
              Query.orderAsc('$createdAt'),
              Query.limit(100),
            ],
          }),
        ])

        rows = [
          ...beforeResponse.rows.reverse(),
          ...afterResponse.rows,
        ]
      } else {
        const response = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: MESSAGES_TABLE_ID,
          queries: [
            Query.equal('conversationId', [conversationId]),
            Query.orderDesc('$createdAt'),
            Query.limit(100),
          ],
        })

        rows = response.rows.reverse()
      }

      // Ta bort eventuella dubletter och behåll kronologisk ordning.
      const uniqueRows = Array.from(
        new Map(rows.map((message) => [message.$id, message])).values()
      ).sort(
        (a, b) =>
          new Date(a.$createdAt).getTime() -
          new Date(b.$createdAt).getTime()
      )

      const knownIds = knownMessageIdsRef.current
      const addedMessages = uniqueRows.filter(
        (message) => !knownIds.has(message.$id)
      )

      if (initialPositionDoneRef.current && addedMessages.length > 0) {
        // Bara följ med automatiskt om användaren redan var längst ner.
        if (isAtBottomRef.current) {
          shouldAutoScrollRef.current = true
        }
      }

      knownMessageIdsRef.current = new Set(
        uniqueRows.map((message) => message.$id)
      )

      setMessages(uniqueRows)
      setErrorMessage('')
    } catch (error) {
      console.error('Kunde inte hämta meddelanden:', error)
      setErrorMessage(
        'Kunde inte hämta meddelandena. Kontrollera anslutningen och behörigheterna.'
      )
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  // Markera endast det senaste meddelandet som faktiskt syns i chattytan.
  const updateReadPositionFromViewport = useCallback(() => {
    const container = messagesListRef.current

    if (!container || !initialPositionDoneRef.current) return

    const containerRect = container.getBoundingClientRect()
    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <= 80

    isAtBottomRef.current = isAtBottom

    let latestVisibleElement = null
    const messageElements = container.querySelectorAll(
      '[data-message-created-at]'
    )

    messageElements.forEach((element) => {
      const rect = element.getBoundingClientRect()
      const isVisible =
        rect.bottom > containerRect.top && rect.top < containerRect.bottom

      if (isVisible) {
        latestVisibleElement = element
      }
    })

    const visibleMessageAt =
      latestVisibleElement?.dataset.messageCreatedAt

    if (visibleMessageAt) {
      const visibleTime = new Date(visibleMessageAt).getTime()
      const previousReadTime = lastReadAtRef.current
        ? new Date(lastReadAtRef.current).getTime()
        : 0

      if (visibleTime > previousReadTime) {
        lastReadAtRef.current = visibleMessageAt

        if (membershipRowId && onRead) {
          // Köa skrivningarna så att en äldre uppdatering aldrig kan
          // råka skriva över en nyare läsposition.
          readUpdateQueueRef.current = readUpdateQueueRef.current
            .then(() =>
              onRead(membershipRowId, conversationId, visibleMessageAt)
            )
            .catch((error) => {
              console.error('Kunde inte uppdatera läspositionen:', error)
            })
        }
      }
    }

    const readTime = lastReadAtRef.current
      ? new Date(lastReadAtRef.current).getTime()
      : 0

    const remainingUnread = messages.filter((message) => {
      return (
        message.senderId !== currentUserId &&
        message.type !== 'game_move' &&
        message.type !== 'game_invite_response' &&
        new Date(message.$createdAt).getTime() > readTime
      )
    }).length

    setNewMessagesCount(remainingUnread)
  }, [
    messages,
    currentUserId,
    membershipRowId,
    conversationId,
    onRead,
  ])

  const scrollToLatest = useCallback((behavior = 'smooth') => {
    const container = messagesListRef.current
    if (!container) return

    container.scrollTo({
      top: container.scrollHeight,
      behavior,
    })

    // Om allt innehåll redan ryms i fönstret kan scrollTop vara oförändrat
    // och då kommer inget scroll-event. Läs av synliga meddelanden ändå.
    requestAnimationFrame(updateReadPositionFromViewport)
  }, [updateReadPositionFromViewport])

  // Nollställ refs och hämta rätt del av historiken när en annan chatt öppnas.
  useEffect(() => {
    initialLastReadAtRef.current = chat?.lastReadAt || null
    lastReadAtRef.current = chat?.lastReadAt || null
    knownMessageIdsRef.current = new Set()
    initialPositionDoneRef.current = false
    shouldAutoScrollRef.current = false
    isAtBottomRef.current = true
    readUpdateQueueRef.current = Promise.resolve()

    setMessages([])
    setNewMessagesCount(0)
    setLoading(true)
    setErrorMessage('')

    if (!conversationId) {
      setLoading(false)
      return
    }

    loadMessages()

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${MESSAGES_TABLE_ID}.rows`,
      (event) => {
        const row = event.payload

        if (row?.conversationId === conversationId) {
          loadMessages()
        }
      }
    )

    return () => unsubscribe()
  }, [conversationId, loadMessages])

  // Första gången chatten öppnas återställs den till senaste lästa meddelandet.
  useEffect(() => {
    if (loading || initialPositionDoneRef.current) return

    const animationFrame = requestAnimationFrame(() => {
      const container = messagesListRef.current
      if (!container) return

      if (messages.length === 0) {
        container.scrollTop = container.scrollHeight
      } else {
        const lastReadAt = initialLastReadAtRef.current

        if (!lastReadAt) {
          container.scrollTop = container.scrollHeight
        } else {
          const readTime = new Date(lastReadAt).getTime()
          let anchorMessage = null

          // Först försöker vi hitta det exakta meddelandet man senast läste.
          for (let index = messages.length - 1; index >= 0; index -= 1) {
            if (
              new Date(messages[index].$createdAt).getTime() <= readTime
            ) {
              anchorMessage = messages[index]
              break
            }
          }

          // Om det saknas (t.ex. första meddelandet i en ny chatt),
          // börja vid det första meddelandet efter läspositionen.
          if (!anchorMessage) {
            anchorMessage = messages.find(
              (message) =>
                new Date(message.$createdAt).getTime() > readTime
            )
          }

          if (anchorMessage) {
            const anchorElement = container.querySelector(
              `[data-message-id="${anchorMessage.$id}"]`
            )

            if (anchorElement) {
              const containerTop = container.getBoundingClientRect().top
              const anchorTop = anchorElement.getBoundingClientRect().top

              container.scrollTop += anchorTop - containerTop - 12
            } else {
              container.scrollTop = container.scrollHeight
            }
          } else {
            container.scrollTop = container.scrollHeight
          }
        }
      }

      initialPositionDoneRef.current = true
      updateReadPositionFromViewport()
    })

    return () => cancelAnimationFrame(animationFrame)
  }, [loading, messages, conversationId, updateReadPositionFromViewport])

  // Nya meddelanden: följ med längst ner bara om användaren redan var där.
  useEffect(() => {
    if (!initialPositionDoneRef.current) return

    if (shouldAutoScrollRef.current) {
      shouldAutoScrollRef.current = false
      const animationFrame = requestAnimationFrame(() => {
        scrollToLatest('smooth')
      })

      return () => cancelAnimationFrame(animationFrame)
    }

    updateReadPositionFromViewport()
  }, [messages, scrollToLatest, updateReadPositionFromViewport])

  async function sendMessage(event) {
    event.preventDefault()

    const text = draft.trim()

    if (!text || sending || !conversationId || !currentUserId) {
      return
    }

    async function acceptGameInvite(invite) {
      if (!invite?.inviteId || !conversationId || !currentUserId || acceptingGameInviteId) {
        return
      }

      setAcceptingGameInviteId(invite.inviteId)
      setErrorMessage('')

      try {
        await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: MESSAGES_TABLE_ID,
          rowId: ID.unique(),
          data: {
            conversationId,
            senderId: currentUserId,
            text: JSON.stringify({
              inviteId: invite.inviteId,
              status: 'accepted',
              playerId: currentUserId,
            }),
            type: 'game_invite_response',
          },
          permissions: [
            Permission.read(Role.users()),
            Permission.update(Role.user(currentUserId)),
            Permission.delete(Role.user(currentUserId)),
          ],
        })

        onAcceptGameInvite?.({
          ...invite,
          conversationId,
        })
      } catch (error) {
        console.error('Spelinbjudan kunde inte godkännas:', error)
        setErrorMessage(
          `Spelinbjudan kunde inte godkännas: ${error.message || 'Okänt fel'}`
        )
      } finally {
        setAcceptingGameInviteId(null)
      }
    }

    setSending(true)
    setErrorMessage('')

    try {
      await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: MESSAGES_TABLE_ID,
        rowId: ID.unique(),
        data: {
          conversationId,
          senderId: currentUserId,
          text,
          type: 'text',
        },
        permissions: [
          Permission.read(Role.users()),
          Permission.update(Role.user(currentUserId)),
          Permission.delete(Role.user(currentUserId)),
        ],
      })

      setDraft('')
      await loadMessages()
    } catch (error) {
      console.error('Kunde inte skicka meddelandet:', error)

      setErrorMessage(
        `Meddelandet kunde inte skickas: ${error.message || 'Okänt fel'}`
      )
    } finally {
      setSending(false)
    }
  }

  async function deleteMessage(message) {
    if (
      !message?.$id ||
      message.senderId !== currentUserId ||
      message.type === 'deleted' ||
      deletingMessageId
    ) {
      return
    }

    const itemName = message.type === 'twist' ? 'Twist' : 'meddelandet'
    const confirmed = window.confirm(`Ta bort ${itemName}?`)
    if (!confirmed) return

    setDeletingMessageId(message.$id)
    setErrorMessage('')

    const senderName = chat?.members?.find(
      (member) => member.userId === currentUserId
    )?.username || currentUser?.name || 'Du'
    const deletedItem = message.type === 'twist' ? 'twist' : 'chatt'

    try {
      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: MESSAGES_TABLE_ID,
        rowId: message.$id,
        data: {
          type: 'deleted',
          text: `${senderName} raderade en ${deletedItem}`,
        },
      })

      await loadMessages()
    } catch (error) {
      console.error('Meddelandet kunde inte tas bort:', error)
      setErrorMessage(
        `Meddelandet kunde inte tas bort: ${error.message || 'Okänt fel'}`
      )
    } finally {
      setDeletingMessageId(null)
    }
  }

  function openMessageMenu(event, message) {
    if (message.senderId !== currentUserId || message.type === 'deleted') return

    event.preventDefault()
    setMessageMenu({
      message,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 170)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 100)),
    })
  }

  function startEditingMessage(message) {
    setEditingMessageId(message.$id)
    setEditingText(message.text || '')
    setMessageMenu(null)
  }

  async function saveEditedMessage(event, message) {
    event.preventDefault()
    const text = editingText.trim()

    if (!text || text === message.text || savingEdit) {
      if (text === message.text) setEditingMessageId(null)
      return
    }

    setSavingEdit(true)
    setErrorMessage('')

    try {
      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: MESSAGES_TABLE_ID,
        rowId: message.$id,
        data: { text },
      })
      setEditingMessageId(null)
      setEditingText('')
      await loadMessages()
    } catch (error) {
      console.error('Meddelandet kunde inte ändras:', error)
      setErrorMessage(
        `Meddelandet kunde inte ändras: ${error.message || 'Okänt fel'}`
      )
    } finally {
      setSavingEdit(false)
    }
  }

  useEffect(() => {
    if (!messageMenu) return

    function dismissMenu(event) {
      if (event.type === 'keydown' && event.key === 'Escape') {
        setMessageMenu(null)
      } else if (
        event.type !== 'keydown' &&
        !event.target.closest?.('.message-context-menu')
      ) {
        setMessageMenu(null)
      }
    }

    window.addEventListener('pointerdown', dismissMenu)
    window.addEventListener('keydown', dismissMenu)
    return () => {
      window.removeEventListener('pointerdown', dismissMenu)
      window.removeEventListener('keydown', dismissMenu)
    }
  }, [messageMenu])

  function getDayLabel(date) {
    const messageDate = new Date(date)
    const today = new Date()

    const messageDay = new Date(
      messageDate.getFullYear(),
      messageDate.getMonth(),
      messageDate.getDate()
    )

    const todayDay = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    )

    const difference = Math.round(
      (todayDay - messageDay) / (1000 * 60 * 60 * 24)
    )

    if (difference === 0) return 'Idag'
    if (difference === 1) return 'Igår'
    if (difference === 2) return 'I förrgår'

    if (difference >= 3 && difference < 7) {
      const weekday = messageDate.toLocaleDateString('sv-SE', {
        weekday: 'long',
      })

      return `I ${weekday}`
    }

    return messageDate.toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  function getDateKey(date) {
    const d = new Date(date)

    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
  }

  return (
    <section className="page chat-page">
      <div className="chat-panel">
        <div className="messages-area">
          <div
            className="messages-list"
            ref={messagesListRef}
            onScroll={updateReadPositionFromViewport}
            aria-live="polite"
          >
            {loading && (
              <p className="empty-search">Hämtar meddelanden...</p>
            )}

            {!loading && messages.length === 0 && (
              <p className="empty-search">
                Här är det tomt än så länge. Säg hej! 💌
              </p>
            )}

            {messages.map((message, index) => {
              if (
                message.type === 'game_invite_response' ||
                message.type === 'game_move'
              ) {
                return null
              }

              const isMine = message.senderId === currentUserId

              const isFirstMessageOfDay =
                index === 0 ||
                getDateKey(message.$createdAt) !==
                  getDateKey(messages[index - 1].$createdAt)

              return (
                <div
                  key={message.$id}
                  data-message-id={message.$id}
                  data-message-created-at={message.$createdAt}
                >
                  {isFirstMessageOfDay && (
                    <p className="day-divider">
                      {getDayLabel(message.$createdAt)}
                    </p>
                  )}

                  <div
                    className={`message-row ${isMine ? 'mine' : 'theirs'}`}
                    onContextMenu={(event) => openMessageMenu(event, message)}
                  >
                    {!isMine && (
                      <ProfileAvatar
                        profile={chat?.members?.find((member) => member.userId === message.senderId)?.avatarProfile}
                        userId={message.senderId}
                        name={chat?.members?.find((member) => member.userId === message.senderId)?.username}
                        size={32}
                        className="message-avatar"
                      />
                    )}
                    {message.type === 'game_invite' ? (
                      (() => {
                        let invite = null
                        try {
                          invite = JSON.parse(message.text)
                        } catch (error) {
                          console.error('Ogiltig spelinbjudan:', error)
                        }
                        if (!invite?.inviteId) {
                          return <div className="message-bubble">Ogiltig spelinbjudan.</div>
                        }

                        const response = messages.find((item) => {
                          if (item.type !== 'game_invite_response') return false
                          try {
                            return JSON.parse(item.text).inviteId === invite.inviteId
                          } catch {
                            return false
                          }
                        })
                        let responseStatus = null
                        if (response) {
                          try {
                            responseStatus = JSON.parse(response.text).status
                          } catch (error) {
                            console.error('Ogiltigt svar på spelinbjudan:', error)
                          }
                        }
                        const canJoin =
                          invite.toUserId === currentUserId &&
                          responseStatus !== 'accepted'

                        return (
                          <div className="game-invite-card">
                            <span className="game-invite-icon" aria-hidden="true">⭕</span>
                            <strong>Tic-tac-toe-inbjudan</strong>
                            <span>
                              {responseStatus === 'accepted'
                                ? 'Inbjudan accepterad'
                                : invite.fromName
                                  ? `${invite.fromName} vill spela med dig`
                                  : 'Du har blivit inbjuden att spela'}
                            </span>
                            {canJoin && (
                              <button
                                type="button"
                                disabled={acceptingGameInviteId === invite.inviteId}
                                onClick={() => acceptGameInvite(invite)}
                              >
                                {acceptingGameInviteId === invite.inviteId
                                  ? 'Ansluter...'
                                  : 'Acceptera och spela'}
                              </button>
                            )}
                          </div>
                        )
                      })()
                    ) : message.type === 'twist' ? (
                      <TwistMessage
                        message={message}
                        currentUserId={currentUserId}
                        isMine={isMine}
                        members={chat?.members || []}
                      />
                    ) : (
                      <div
                        className={`message-bubble ${message.type === 'deleted' ? 'message-deleted' : ''}`}
                      >
                        {editingMessageId === message.$id ? (
                          <form
                            className="message-edit-form"
                            onSubmit={(event) => saveEditedMessage(event, message)}
                          >
                            <textarea
                              value={editingText}
                              onChange={(event) => setEditingText(event.target.value)}
                              maxLength={2000}
                              autoFocus
                              aria-label="Ändra meddelande"
                            />
                            <span className="message-edit-actions">
                              <button type="submit" disabled={savingEdit || !editingText.trim()}>
                                {savingEdit ? 'Sparar...' : 'Spara'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingMessageId(null)}
                                disabled={savingEdit}
                              >
                                Avbryt
                              </button>
                            </span>
                          </form>
                        ) : (
                          <>
                            {message.text}
                            {message.$updatedAt &&
                              message.$updatedAt !== message.$createdAt &&
                              message.type !== 'deleted' && (
                                <span className="message-edited">ändrat</span>
                              )}
                          </>
                        )}

                        <span className="message-time">
                          {new Date(message.$createdAt).toLocaleTimeString(
                            'sv-SE',
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                            }
                          )}
                        </span>
                      </div>
                    )}
                    {isMine && (
                      <ProfileAvatar
                        profile={chat?.members?.find((member) => member.userId === message.senderId)?.avatarProfile}
                        userId={message.senderId}
                        name={chat?.members?.find((member) => member.userId === message.senderId)?.username}
                        size={32}
                        className="message-avatar"
                      />
                    )}
                  </div>
                </div>
              )
            })}

            {messageMenu && (
              <div
                className="message-context-menu"
                role="menu"
                style={{ left: messageMenu.x, top: messageMenu.y }}
              >
                {messageMenu.message.type === 'text' && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => startEditingMessage(messageMenu.message)}
                  >
                    Ändra
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="message-context-delete"
                  disabled={deletingMessageId === messageMenu.message.$id}
                  onClick={() => {
                    const message = messageMenu.message
                    setMessageMenu(null)
                    deleteMessage(message)
                  }}
                >
                  {deletingMessageId === messageMenu.message.$id ? 'Tar bort...' : 'Ta bort'}
                </button>
              </div>
            )}

            {errorMessage && (
              <p className="camera-error" role="alert">
                {errorMessage}
              </p>
            )}
          </div>

          {newMessagesCount > 0 && (
            <button
              type="button"
              className="new-messages-indicator"
              onClick={() => scrollToLatest('smooth')}
            >
              ↓ {newMessagesCount}{' '}
              {newMessagesCount === 1
                ? 'oläst meddelande längre ner'
                : 'olästa meddelanden längre ner'}
            </button>
          )}
        </div>

        <form className="message-form" onSubmit={sendMessage}>
          <button
            type="button"
            className="message-camera-button"
            onClick={() => setShowTwistCamera(true)}
            disabled={!conversationId || !currentUserId}
            aria-label="Skicka en Twist"
            title="Skicka en Twist"
          >
            <CameraIcon size={20} aria-hidden="true" />
          </button>

          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Skriv något gulligt..."
            aria-label="Skriv ett meddelande"
            maxLength={2000}
            disabled={sending || !conversationId}
          />

          <button
            type="submit"
            aria-label="Skicka meddelande"
            disabled={!draft.trim() || sending}
          >
            {sending ? '…' : '↗'}
          </button>
        </form>
      </div>

      {showTwistCamera && (
        <div className="chat-camera-overlay">
          <div
            className="chat-camera-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Skicka en Twist"
          >
            <Camera
              currentUser={currentUser}
              targetConversation={chat}
              onClose={() => setShowTwistCamera(false)}
            />
          </div>
        </div>
      )}
    </section>
  )
}
