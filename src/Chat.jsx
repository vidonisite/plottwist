import { useCallback, useEffect, useState } from 'react'
import { ID, Query, Permission, Role } from 'appwrite'

import {
  client,
  tablesDB,
  DATABASE_ID,
  MESSAGES_TABLE_ID,
} from './lib/appwrite.js'

import TwistMessage from './TwistMessage.jsx'
import './Chat.css'

export default function Chat({ chat, currentUser }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const conversationId = chat?.id
  const currentUserId = currentUser?.$id

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

  useEffect(() => {
    setMessages([])
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

  async function sendMessage(event) {
    event.preventDefault()

    const text = draft.trim()

    if (!text || sending || !conversationId || !currentUserId) {
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


  function getDayLabel(date) {
    const messageDate = new Date(date)
    const today = new Date()
  
    // Nollställ klockslaget så att vi bara jämför datum.
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
  
    // Senaste veckan: veckodagens namn.
    if (difference >= 3 && difference < 7) {
      const weekday = messageDate.toLocaleDateString('sv-SE', {
        weekday: 'long',
      })
  
      return `I ${weekday}`
    }
  
    // Äldre meddelanden: datum.
    return messageDate.toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }



  
  return (
    <section className="page chat-page">
      <div className="chat-panel">
        <div className="messages-list" aria-live="polite">
          <p className="day-divider">
            {getDayLabel(message.$createdAt)}
          </p>

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
                {message.type === 'twist' ? (
                  <TwistMessage
                    message={message}
                    currentUserId={currentUserId}
                    isMine={isMine}
                  />
                ) : (
                  <div className="message-bubble">
                    {message.text}

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
