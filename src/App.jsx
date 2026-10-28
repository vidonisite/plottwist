import { useEffect, useMemo, useState } from 'react'
import { Query } from 'appwrite'
import {
  account,
  tablesDB,
  DATABASE_ID,
  USERS_TABLE_ID,
  CONVERSATIONS_TABLE_ID,
  CONVERSATION_MEMBERS_TABLE_ID,
} from './lib/appwrite.js'
import AuthPage from './auth/AuthPage.jsx'
import Camera from './Camera.jsx'
import Chat from './Chat.jsx'
import AddPeople from './AddPeople.jsx'
import './App.css'


function conversationIdForLog(membership) {
  return membership?.conversationId || 'okänd konversation'
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [activeView, setActiveView] = useState('camera')
  const [activeChat, setActiveChat] = useState(null)
  const [search, setSearch] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [notifications, setNotifications] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)
  const [authError, setAuthError] = useState('')
  const [chats, setChats] = useState([])
  const [loadingChats, setLoadingChats] = useState(false)
  const [chatError, setChatError] = useState('')

  // Kontrollera om användaren har en giltig Appwrite-session.
  useEffect(() => {
    let cancelled = false

    async function checkSession() {
      try {
        const user = await account.get()

        if (!cancelled) {
          setCurrentUser(user)
        }
      } catch (error) {
        if (!cancelled) {
          // Ingen session är normalt för en utloggad användare.
          setCurrentUser(null)
          setProfile(null)

          if (error?.code !== 401) {
            console.error('Kunde inte kontrollera sessionen:', error)
            setAuthError(
              'Kunde inte kontakta Appwrite. Kontrollera anslutningen och försök igen.'
            )
          }
        }
      } finally {
        if (!cancelled) {
          setCheckingSession(false)
        }
      }
    }

    checkSession()

    return () => {
      cancelled = true
    }
  }, [])



  useEffect(() => {
    if (!currentUser) {
      setChats([])
      return
    }

    let cancelled = false

    async function loadChats() {
      setLoadingChats(true)
      setChatError('')

      try {
        // Hämta profilrader så att vi kan visa användarnamn.
        const profilesResponse = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: USERS_TABLE_ID,
          queries: [Query.limit(100)],
        })

        const profiles = profilesResponse.rows

        // Hitta alla medlemsrader som tillhör den inloggade användaren.
        const membershipsResponse = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: CONVERSATION_MEMBERS_TABLE_ID,
          queries: [
            Query.equal('userId', [currentUser.$id]),
            Query.limit(100),
          ],
        })

        const memberships = membershipsResponse.rows
        console.log('Inloggad användares ID:', currentUser.$id)
        console.log('Hittade medlemsrader:', memberships)
        console.log('Antal medlemsrader:', memberships.length)

        // Hämta konversationerna och hitta den andra medlemmen i varje chatt.
        const loadedChats = await Promise.all(
          memberships.map(async (membership) => {
            try {
              const conversation = await tablesDB.getRow({
                databaseId: DATABASE_ID,
                tableId: CONVERSATIONS_TABLE_ID,
                rowId: membership.conversationId,
              })

              const membersResponse = await tablesDB.listRows({
                databaseId: DATABASE_ID,
                tableId: CONVERSATION_MEMBERS_TABLE_ID,
                queries: [
                  Query.equal('conversationId', [conversation.$id]),
                  Query.limit(10),
                ],
              })

              const otherMember = membersResponse.rows.find(
                (member) => member.userId !== currentUser.$id
              )

              // Visa inte konversationer där den andra medlemmen saknas.
              if (!otherMember) return null

              const otherProfile = profiles.find(
                (item) => item.userId === otherMember.userId
              )

              const username =
                otherProfile?.username || 'Okänd användare'

              return {
                id: conversation.$id,
                name: username,
                username,
                otherUserId: otherMember.userId,
                initials: username.slice(0, 1).toUpperCase(),
                preview: 'Privat konversation',
              }
            } catch (error) {
              console.error(
                'Kunde inte läsa en konversation:',
                conversationIdForLog(membership),
                error
              )

              if (!cancelled) {
                setChatError(
                  `Kunde inte läsa konversationen: ${
                    error.message || 'Okänt fel'
                  }`
                )
              }

              return null
            }
          })
        )

        if (cancelled) return

        // Ta bort misslyckade hämtningar och eventuella dubletter.
        const uniqueChats = Array.from(
          new Map(
            loadedChats
              .filter(Boolean)
              .map((chat) => [chat.id, chat])
          ).values()
        )

        uniqueChats.sort((a, b) => a.name.localeCompare(b.name))
        setChats(uniqueChats)
      } catch (error) {
        console.error('Kunde inte ladda chattlistan:', error)

        if (!cancelled) {
          setChatError(
            `Kunde inte ladda chattar: ${error.message || 'Okänt fel'}`
          )
        }
      } finally {
        if (!cancelled) setLoadingChats(false)
      }
    }

    loadChats()

    return () => {
      cancelled = true
    }
  }, [currentUser])



  function handleAuthenticated(result) {
    setCurrentUser(result.user)
    setProfile(result.profile)
    setAuthError('')
    setActiveView('camera')
  }

  async function handleLogout() {
    setLoggingOut(true)
    setAuthError('')

    try {
      await account.deleteSession({ sessionId: 'current' })

      setCurrentUser(null)
      setProfile(null)
      setActiveChat(null)
      setActiveView('camera')
      setSearch('')
    } catch (error) {
      console.error('Kunde inte logga ut:', error)
      setAuthError(
        `Kunde inte logga ut: ${error.message || 'Okänt fel'}`
      )
    } finally {
      setLoggingOut(false)
    }
  }

  const filteredChats = useMemo(() => {
    const query = search.trim().toLowerCase()

    if (!query) return chats

    return chats.filter((chat) =>
      chat.name.toLowerCase().includes(query)
    )
  }, [chats, search])

  function openChat(chat) {
    setActiveChat(chat)
    setActiveView('chat')
  }

  function showCamera() {
    setActiveChat(null)
    setActiveView('camera')
  }

  function showView(view) {
    setActiveChat(null)
    setActiveView(view)
  }

  // Visa laddningsvy tills vi vet om användaren är inloggad.
  if (checkingSession) {
    return (
      <main className="auth-screen">
        <section className="auth-card">
          <div className="auth-brand">
            <span className="auth-brand-mark">✳</span>
            <span>PLOT <em>TWIST</em></span>
          </div>
          <p className="auth-description">Kontrollerar din session...</p>
        </section>
      </main>
    )
  }

  // Utloggade användare får inloggnings- och registreringssidan.
  if (!currentUser) {
    return (
      <>
        {authError && (
          <div role="alert" className="auth-error">
            {authError}
          </div>
        )}
        <AuthPage onAuthenticated={handleAuthenticated} />
      </>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          onClick={showCamera}
          aria-label="PLOT TWIST, gå till kameran"
        >
          <span className="brand-mark">✳</span>
          <span className="brand-name">
            PLOT <strong>TWIST</strong>
          </span>
        </button>

        <div className="sidebar-search-row">
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Sök chattar"
              aria-label="Sök chattar"
            />

            {search && (
              <button
                type="button"
                className="clear-search"
                onClick={() => setSearch('')}
                aria-label="Rensa sökning"
              >
                ×
              </button>
            )}
          </label>

          <button
            className={`add-person-button ${
              activeView === 'add' ? 'selected' : ''
            }`}
            onClick={() => showView('add')}
            aria-label="Lägg till personer"
            title="Lägg till personer"
          >
            +
          </button>
        </div>

        <div className="sidebar-section-title">
          <span>CHATTAR</span>
          <span className="chat-count">{filteredChats.length}</span>
        </div>

        <div className="chat-list">

          {loadingChats && (
            <p className="empty-search">Laddar chattar...</p>
          )}

          {chatError && (
            <p className="empty-search" role="alert">
              {chatError}
            </p>
          )}
          
          {filteredChats.map((chat) => (
            <button
              key={chat.id}
              className={`chat-list-item ${
                activeView === 'chat' && activeChat?.id === chat.id
                  ? 'selected'
                  : ''
              }`}
              onClick={() => openChat(chat)}
            >
              <span className="chat-avatar">{chat.initials}</span>
              <span className="chat-list-copy">
                <strong>{chat.name}</strong>
                <small>{chat.preview}</small>
              </span>
            </button>
          ))}

          {filteredChats.length === 0 && (
            <p className="empty-search">
              Inga chattar matchar sökningen.
            </p>
          )}
        </div>

        <div className="sidebar-bottom">
          <button
            className={`sidebar-action ${
              activeView === 'settings' ? 'selected' : ''
            }`}
            onClick={() => showView('settings')}
          >
            <span className="sidebar-action-icon">⚙</span>
            <span>Inställningar</span>
          </button>

          <div className="sidebar-footer">
            <span className="footer-dot" />
            <span>@{profile?.username || currentUser.name}</span>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <div className="mobile-brand">
          <span className="brand-mark">✳</span>
          <span className="brand-name">
            PLOT <strong>TWIST</strong>
          </span>
        </div>

        {activeView === 'camera' && (
          <section className="workspace-view camera-view">
            <Camera />
          </section>
        )}

        {activeView === 'chat' && (
          <section className="workspace-view chat-view">
            <div className="conversation-content">
              <Chat chat={activeChat} />
            </div>
          </section>
        )}

        {activeView === 'add' && <AddPeople />}

        {activeView === 'settings' && (
          <section className="workspace-view simple-view settings-view">
            <div className="view-symbol purple-symbol">⚙</div>
            <h1>Inställningar</h1>
            <p className="view-description">
              Anpassa din plats på PLOT TWIST.
            </p>

            <div className="settings-card">
              <label htmlFor="display-name">Visningsnamn</label>
              <input
                id="display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Vad ska andra kalla dig?"
              />
              <p className="setting-help">
                Det här namnet sparas bara i den här vyn just nu.
              </p>
            </div>

            <div className="settings-row">
              <div>
                <strong>Notiser</strong>
                <p>Visa notiser i appen</p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={notifications}
                aria-label="Aktivera notiser"
                className={`toggle-switch ${notifications ? 'on' : ''}`}
                onClick={() => setNotifications((value) => !value)}
              >
                <span />
              </button>
            </div>

            <div className="settings-card">
              <p><strong>Inloggat konto</strong></p>
              <p>{currentUser.email}</p>
              <p className="setting-help">
                Användarnamn: @{profile?.username || currentUser.name}
              </p>

              <button
                type="button"
                className="auth-submit"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? 'Loggar ut...' : 'Logga ut'}
              </button>
            </div>

            {authError && (
              <p className="auth-error" role="alert">
                {authError}
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  )
}