import { useCallback, useEffect, useMemo, useState } from 'react'
import { Query } from 'appwrite'
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushSubscription,
  pushNotificationsSupported,
  registerPushSubscription,
} from './lib/pushNotifications.js'

import {
  account,
  tablesDB,
  DATABASE_ID,
  USERS_TABLE_ID,
  CONVERSATIONS_TABLE_ID,
  CONVERSATION_MEMBERS_TABLE_ID,
  MESSAGES_TABLE_ID,
} from './lib/appwrite.js'

import AuthPage from './auth/AuthPage.jsx'
import Camera from './Camera.jsx'
import Chat from './Chat.jsx'
import AddPeople from './AddPeople.jsx'
import CreateGroup from './CreateGroup.jsx'

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
  const [notifications, setNotifications] = useState(false)
  const [notificationError, setNotificationError] = useState('')
  const [updatingNotifications, setUpdatingNotifications] = useState(false)

  const [loggingOut, setLoggingOut] = useState(false)
  const [authError, setAuthError] = useState('')

  const [chats, setChats] = useState([])
  const [loadingChats, setLoadingChats] = useState(false)
  const [chatError, setChatError] = useState('')
  const [chatsRefresh, setChatsRefresh] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function checkPushSubscription() {
      if (!currentUser || !pushNotificationsSupported) {
        setNotifications(false)
        return
      }

      try {
        const subscription = await getPushSubscription()

        if (subscription) {
          await registerPushSubscription(subscription)
        }

        if (!cancelled) {
          setNotifications(Boolean(subscription))
        }
      } catch (error) {
        console.error('Kunde inte kontrollera pushnotiser:', error)
        if (!cancelled) {
          setNotifications(false)
          setNotificationError(
            error.message || 'Pushnotisernas status kunde inte kontrolleras.'
          )
        }
      }
    }

    checkPushSubscription()

    return () => {
      cancelled = true
    }
  }, [currentUser])

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

  // Hämta alla konversationer där användaren är medlem.
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
        const [profilesResponse, membershipsResponse] =
          await Promise.all([
            tablesDB.listRows({
              databaseId: DATABASE_ID,
              tableId: USERS_TABLE_ID,
              queries: [Query.limit(100)],
            }),

            tablesDB.listRows({
              databaseId: DATABASE_ID,
              tableId: CONVERSATION_MEMBERS_TABLE_ID,
              queries: [
                Query.equal('userId', [currentUser.$id]),
                Query.limit(100),
              ],
            }),
          ])

        const profiles = profilesResponse.rows
        const memberships = membershipsResponse.rows

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
                  Query.limit(100),
                ],
              })

              const members = membersResponse.rows

              // Hämta olästa meddelanden som skickats efter senaste läsningen.
              const lastReadAt = membership.lastReadAt || membership.$createdAt

              const unreadResponse = await tablesDB.listRows({
                databaseId: DATABASE_ID,
                tableId: MESSAGES_TABLE_ID,
                queries: [
                  Query.equal('conversationId', [conversation.$id]),
                  Query.greaterThan('$createdAt', lastReadAt),
                  Query.notEqual('senderId', [currentUser.$id]),
                  Query.limit(1),
                ],
              })

              const unreadCount = unreadResponse.total || 0

              if (conversation.type === 'group') {
                const memberProfiles = members.map((member) => {
                  const memberProfile = profiles.find(
                    (item) => item.userId === member.userId
                  )

                  return {
                    userId: member.userId,
                    username: memberProfile?.username || 'Okänd användare',
                  }
                })

                return {
                  id: conversation.$id,
                  type: 'group',
                  name: conversation.name || 'Namnlös grupp',
                  username: conversation.name || 'Namnlös grupp',
                  initials: (conversation.name || 'G').slice(0, 1).toUpperCase(),
                  members: memberProfiles,
                  memberCount: members.length,
                  preview: `${members.length} medlemmar`,
                  membershipRowId: membership.$id,
                  lastReadAt,
                  unreadCount,
                }
              }

              const otherMember = members.find(
                (member) => member.userId !== currentUser.$id
              )

              if (!otherMember) return null

              const otherProfile = profiles.find(
                (item) => item.userId === otherMember.userId
              )

              const username =
                otherProfile?.username || 'Okänd användare'

              return {
                id: conversation.$id,
                type: 'direct',
                name: username,
                username,
                otherUserId: otherMember.userId,
                initials: username.slice(0, 1).toUpperCase(),
                members: [
                  {
                    userId: currentUser.$id,
                    username:
                      profile?.username || currentUser.name || 'Du',
                  },
                  {
                    userId: otherMember.userId,
                    username,
                  },
                ],
                memberCount: 2,
                preview: 'Privat konversation',
                membershipRowId: membership.$id,
                lastReadAt,
                unreadCount,
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

        const uniqueChats = Array.from(
          new Map(
            loadedChats
              .filter(Boolean)
              .map((chat) => [chat.id, chat])
          ).values()
        )

        uniqueChats.sort((a, b) => a.name.localeCompare(b.name))

        setChats(uniqueChats)

        // Uppdatera den aktiva chatten om den finns kvar.
        setActiveChat((previous) => {
          if (!previous) return previous

          return uniqueChats.find(
            (chat) => chat.id === previous.id
          ) || previous
        })
      } catch (error) {
        console.error('Kunde inte ladda chattlistan:', error)

        if (!cancelled) {
          setChatError(
            `Kunde inte ladda chattar: ${error.message || 'Okänt fel'}`
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingChats(false)
        }
      }
    }

    loadChats()

    return () => {
      cancelled = true
    }
  }, [currentUser, chatsRefresh])

  const handleChatRead = useCallback(
    async (membershipRowId, conversationId, latestMessageAt) => {
      if (!membershipRowId || !conversationId || !latestMessageAt || !currentUser?.$id) {
        return
      }

      try {
        // Räkna meddelanden som fortfarande ligger efter läspositionen.
        // Det gör att sidomenyn inte nollställs förrän de faktiskt har visats.
        const unreadResponse = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: MESSAGES_TABLE_ID,
          queries: [
            Query.equal('conversationId', [conversationId]),
            Query.greaterThan('$createdAt', latestMessageAt),
            Query.notEqual('senderId', [currentUser.$id]),
            Query.limit(1),
          ],
        })

        const unreadCount = unreadResponse.total || 0

        await tablesDB.updateRow({
          databaseId: DATABASE_ID,
          tableId: CONVERSATION_MEMBERS_TABLE_ID,
          rowId: membershipRowId,
          data: {
            lastReadAt: latestMessageAt,
          },
        })

        setChats((previous) =>
          previous.map((chat) =>
            chat.id === conversationId
              ? { ...chat, lastReadAt: latestMessageAt, unreadCount }
              : chat
          )
        )

        setActiveChat((previous) =>
          previous?.id === conversationId
            ? { ...previous, lastReadAt: latestMessageAt, unreadCount }
            : previous
        )
      } catch (error) {
        console.error('Kunde inte markera chatten som läst:', error)
      }
    },
    [currentUser?.$id]
  )

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
      let subscription = null
      let pushCleanupError = ''

      try {
        subscription = await getPushSubscription()
      } catch (error) {
        console.error('Kunde inte läsa pushprenumerationen:', error)
        pushCleanupError =
          'Du loggades ut, men pushprenumerationens status kunde inte kontrolleras.'
      }

      if (subscription) {
        try {
          await disablePushNotifications()
        } catch (error) {
          console.error('Kunde inte ta bort pushprenumerationen:', error)
          await subscription.unsubscribe().catch((unsubscribeError) => {
            console.error(
              'Kunde inte avregistrera pushprenumerationen lokalt:',
              unsubscribeError
            )
          })
          pushCleanupError =
            'Du loggades ut, men servern kunde inte ta bort pushprenumerationen. Kontrollera notisinställningarna nästa gång du loggar in.'
        }
      }

      await account.deleteSession({ sessionId: 'current' })

      setCurrentUser(null)
      setProfile(null)
      setActiveChat(null)
      setActiveView('camera')
      setSearch('')
      setChats([])
      setNotifications(false)
      setAuthError(pushCleanupError)
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
    // Behåll den sparade läspositionen och eventuella olästa meddelanden.
    // Chat-komponenten flyttar fram läspositionen när meddelanden faktiskt syns.
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

  async function togglePushNotifications() {
    if (updatingNotifications) return

    setUpdatingNotifications(true)
    setNotificationError('')

    try {
      if (notifications) {
        await disablePushNotifications()
        setNotifications(false)
      } else {
        await enablePushNotifications()
        setNotifications(true)
      }
    } catch (error) {
      console.error('Kunde inte ändra pushnotiser:', error)
      setNotificationError(
        error.message || 'Pushnotisinställningen kunde inte ändras.'
      )
    } finally {
      setUpdatingNotifications(false)
    }
  }

  function handleGroupCreated(conversation) {
    setChatsRefresh((value) => value + 1)

    setActiveChat({
      id: conversation.$id,
      type: 'group',
      name: conversation.name,
      username: conversation.name,
      initials: conversation.name.slice(0, 1).toUpperCase(),
      members: [],
      memberCount: 0,
      preview: 'Gruppkonversation',
    })

    setActiveView('chat')
  }

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

        {/* Logga och de två knapparna */}
        <div className="sidebar-brand-row">
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

          <div className="brand-buttons">
            <button
              className={`brand-icon-button ${
                activeView === 'add' ? 'selected' : ''
              }`}
              onClick={() => showView('add')}
              aria-label="Lägg till vänner"
              title="Lägg till vänner"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle cx="9" cy="8" r="3.5" />
                <path d="M2.8 20c.4-3.5 2.7-5.5 6.2-5.5s5.8 2 6.2 5.5" />
                <path d="M17 8v6M14 11h6" />
              </svg>
            </button>

            <button
              className={`brand-icon-button group-create-button ${
                activeView === 'create-group' ? 'selected' : ''
              }`}
              onClick={() => showView('create-group')}
              aria-label="Skapa grupp"
              title="Skapa grupp"
            >
              +
            </button>
          </div>
        </div>

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
              <span
                className={`chat-avatar ${
                  chat.type === 'group' ? 'group-avatar' : ''
                }`}
              >
                {chat.type === 'group' ? '♧' : chat.initials}
              </span>

              <span className="chat-list-copy">
                <strong>{chat.name}</strong>
                <small>{chat.preview}</small>
              </span>

              {chat.unreadCount > 0 && (
                <span className="unread-badge" aria-label={`${chat.unreadCount} olästa meddelanden`}>
                  {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                </span>
              )}
            </button>
          ))}

          {!loadingChats && filteredChats.length === 0 && (
            <p className="empty-search">
              {search
                ? 'Inga chattar matchar sökningen.'
                : 'Du har inga chattar ännu.'}
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
            <Camera currentUser={currentUser} />
          </section>
        )}

        {activeView === 'chat' && (
          <>
            <div className="conversation-heading">
              <div
                className={`chat-avatar large ${
                  activeChat?.type === 'group' ? 'group-avatar' : ''
                }`}
              >
                {activeChat?.type === 'group'
                  ? '♧'
                  : activeChat?.initials || '♡'}
              </div>

              <div>
                <h1>
                  {activeChat?.type === 'group'
                    ? activeChat?.name
                    : `@${activeChat?.username || activeChat?.name || 'Din chatt'}`}
                </h1>

                <p>
                  {activeChat?.type === 'group'
                    ? `${activeChat.memberCount || 'Flera'} medlemmar`
                    : 'Privat konversation'}
                </p>
              </div>
            </div>

            <section className="workspace-view chat-view">
              <div className="conversation-content">
                <Chat
                  chat={activeChat}
                  currentUser={currentUser}
                  onRead={handleChatRead}
                />
              </div>
            </section>
          </>
        )}

        {activeView === 'add' && <AddPeople />}

        {activeView === 'create-group' && (
          <CreateGroup
            currentUser={currentUser}
            onCreated={handleGroupCreated}
            onCancel={showCamera}
          />
        )}

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
                <p>
                  {pushNotificationsSupported
                    ? 'Få notiser när du får ett nytt meddelande'
                    : 'Pushnotiser stöds inte i den här webbläsaren'}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={notifications}
                aria-label="Aktivera pushnotiser"
                aria-busy={updatingNotifications}
                disabled={updatingNotifications || !pushNotificationsSupported}
                className={`toggle-switch ${notifications ? 'on' : ''}`}
                onClick={togglePushNotifications}
              >
                <span />
              </button>
            </div>

            {notificationError && (
              <p className="auth-error" role="alert">
                {notificationError}
              </p>
            )}

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
