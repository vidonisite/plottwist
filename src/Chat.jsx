import { useState } from 'react'
import './Chat.css'

const starterMessages = [
  { id: 1, from: 'them', text: 'hallååå 💌', time: '14:02' },
  { id: 2, from: 'me', text: 'heej!! vad händer? ✨', time: '14:03' },
  { id: 3, from: 'them', text: 'har en hemlis 👀', time: '14:04' },
]

export default function Chat({ chat }) {
  const [messages, setMessages] = useState(starterMessages)
  const [draft, setDraft] = useState('')

  function sendMessage(event) {
    event.preventDefault()

    const text = draft.trim()
    if (!text) return

    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        from: 'me',
        text,
        time: new Date().toLocaleTimeString('sv-SE', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      },
    ])

    setDraft('')
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
          <p className="day-divider">IDAG · BARA NI TVÅ</p>

          {messages.map((message) => (
            <div
              key={message.id}
              className={`message-row ${
                message.from === 'me' ? 'mine' : 'theirs'
              }`}
            >
              <div className="message-bubble">
                {message.text}
                <span className="message-time">{message.time}</span>
              </div>
            </div>
          ))}

          <p className="demo-warning">
            Demo: meddelandena sparas bara i den här vyn
            och skickas inte till någon annan ännu.
          </p>
        </div>

        <form className="message-form" onSubmit={sendMessage}>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Skriv något gulligt..."
            aria-label="Skriv ett meddelande"
            maxLength={2000}
          />

          <button
            type="submit"
            aria-label="Lägg till meddelande"
            disabled={!draft.trim()}
          >
            ↗
          </button>
        </form>
      </div>
    </section>
  )
}