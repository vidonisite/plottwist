import { useCallback, useEffect, useState } from 'react'
import { ID, Query, Permission, Role } from 'appwrite'

import {
  client,
  tablesDB,
  DATABASE_ID,
  MESSAGES_TABLE_ID,
} from './lib/appwrite.js'

import './Chat.css'

export default function Chat({ chat, currentUser }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const conversationId = chat?.id
  const currentUserId = currentUser?.$id
  const otherUserId = chat?.otherUserId

  const loadMessages = useCallback(async () => {
    if (!conversationId) return

    try {
      const response = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: MESSAGES_TABLE_ID,
        queries: [
          Query.equal('conversationId', [conversationId]),
          Query.orderAsc('$createdAt'),
          Query.limit(100),
        ],
      })

      setMessages(response.rows)
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

  // Hämta meddelanden när användaren öppnar en konversation.
  useEffect(() => {
    setMessages([])
    setLoading(true)
    setErrorMessage('')

    if (!conversationId) {
      setLoading(false)
      return
    }

    loadMessages()

    // Lyssna efter nya meddelanden i databasen.
    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${MESSAGES_TABLE_ID}.rows`,
      (event) => {
        const row = event.payload

        if (row?.conversationId === conversationId) {
          loadMessages()
        }
      }
    )

    return () => {
      unsubscribe()
    }
  }, [conversationId, loadMessages])

  async function sendMessage(event) {
    event.preventDefault()

    const text = draft.trim()

    if (!text || sending || !conversationId || !currentUserId) {
      return
    }

    if (!otherUserId) {
      setErrorMessage('Kunde inte hitta den andra personen i chatten.')
      return
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
          Permission.read(`user:${currentUserId}`),
          Permission.read(`user:${otherUserId}`),
          Permission.update(`user:${currentUserId}`),
          Permission.delete(`user:${currentUserId}`),
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

  function formatTime(date) {
    return new Date(date).toLocaleTimeString('sv-SE', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const name = chat?.name || 'Din chatt'
  const initials = chat?.initials || '♡'

  return (
    <section className="page chat-page">
      <div className="chat-panel">
        <div className="chat-header">
          <div className="chat-avatar">{initials}</div>

          <div className="chat-person">
            <strong>@{chat?.username || name}</strong>
            <small>
              <span className="status-dot" />
              Privat konversation
            </small>
          </div>

          <span className="chat-menu">•••</span>
        </div>

        <div className="messages-list" aria-live="polite">
          <p className="day-divider">BARA NI TVÅ</p>

          {loading && (
            <p className="empty-search">Hämtar meddelanden...</p>
          )}

          {!loading && messages.length === 0 && (
            <p className="empty-search">
              Här är det tomt än så länge. Säg hej! 💌
            </p>
          )}

          {messages.map((message) => {
            const isMine = message.senderId === currentUserId

            return (
              <div
                key={message.$id}
                className={`message-row ${isMine ? 'mine' : 'theirs'}`}
              >
                <div className="message-bubble">
                  {message.text}
                  <span className="message-time">
                    {formatTime(message.$createdAt)}
                  </span>
                </div>
              </div>
            )
          })}

          {errorMessage && (
            <p className="camera-error" role="alert">
              {errorMessage}
            </p>
          )}
        </div>

        <form className="message-form" onSubmit={sendMessage}>
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
    </section>
  )
}
