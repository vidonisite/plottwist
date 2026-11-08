import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Query } from 'appwrite'
import { Gamepad2, Phone } from 'lucide-react'
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushSubscription,
  pushNotificationsSupported,
  registerPushSubscription,
} from './lib/pushNotifications.js'

import {
  client,
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
import Games from './games.jsx'
import AddPeople from './AddPeople.jsx'
import CreateGroup from './CreateGroup.jsx'
import ProfileAvatar from './components/ProfileAvatar.jsx'
import GroupAvatar from './components/GroupAvatar.jsx'
import AvatarBuilder from './components/AvatarBuilder.jsx'
import { addLatestMessageTimes } from './lib/groupMembers.js'
import useVoiceCall from './hooks/useVoiceCall.js'
import VoiceCallOverlay from './components/VoiceCallOverlay.jsx'

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
  const [gameInvite, setGameInvite] = useState(null)
  const [gameReturnView, setGameReturnView] = useState('camera')
  const [gameTransition, setGameTransition] = useState(null)
  const [gameViewEntering, setGameViewEntering] = useState(false)
  const mainPanelRef = useRef(null)
  const voiceCall = useVoiceCall(currentUser)

  useEffect(() => {
    let cancelled = false

    async function checkPushSubscription() {
      if (!currentUser || !pushNotificationsSupported) {
        setNotifications(false)
        return
      }

      setUpdatingNotifications(true)
      setNotificationError('')

      try {
        const subscription = await getPushSubscription()

        if (subscription) {
          await registerPushSubscription(subscription)
          if (!cancelled) setNotifications(true)
          return
        }

        if (Notification.permission === 'denied') {
          if (!cancelled) {
            setNotifications(false)
            setNotificationError(
              'Notiser är blockerade i webbläsaren. Ändra webbplatsens notisbehörighet i webbläsarinställningarna.'
            )
          }
          return
        }

        const newSubscription = await enablePushNotifications()
        if (!cancelled) setNotifications(Boolean(newSubscription))
      } catch (error) {
        console.error('Kunde inte kontrollera pushnotiser:', error)
        if (!cancelled) {
          setNotifications(false)
          setNotificationError(
            Notification.permission === 'denied'
              ? 'Notiser är blockerade i webbläsaren. Ändra webbplatsens notisbehörighet i webbläsarinställningarna.'
              : error.message || 'Pushnotiserna kunde inte aktiveras.'
          )
        }
      } finally {
        if (!cancelled) setUpdatingNotifications(false)
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

  useEffect(() => {
    if (!currentUser?.$id || profile?.userId === currentUser.$id) return

    let cancelled = false

    async function loadCurrentProfile() {
      try {
        const rowId = (currentUser.name || '').trim().toLowerCase()
        if (!rowId) return

        const loadedProfile = await tablesDB.getRow({
          databaseId: DATABASE_ID,
          tableId: USERS_TABLE_ID,
          rowId,
        })

        if (!cancelled) setProfile(loadedProfile)
      } catch (error) {
        if (error?.code !== 404) {
          console.error('Kunde inte hämta användarprofilen:', error)
        }
      }
    }

    loadCurrentProfile()

    return () => {
      cancelled = true
    }
  }, [currentUser?.$id, profile?.userId])

  useEffect(() => {
    if (!currentUser?.$id) return

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${USERS_TABLE_ID}.rows`,
      (event) => {
        const updatedProfile = event.payload
        if (!updatedProfile?.userId) return

        if (updatedProfile.userId === currentUser.$id) {
          setProfile(updatedProfile)
        }

        const applyProfile = (chat) => ({
          ...chat,
          avatarProfile:
            chat.otherUserId === updatedProfile.userId
              ? updatedProfile
              : chat.avatarProfile,
          members: chat.members?.map((member) =>
            member.userId === updatedProfile.userId
              ? { ...member, username: updatedProfile.username || member.username, avatarProfile: updatedProfile }
              : member
          ),
        })

        setChats((previous) => previous.map(applyProfile))
        setActiveChat((previous) => previous ? applyProfile(previous) : previous)
      }
    )

    return () => unsubscribe()
  }, [currentUser?.$id])

  useEffect(() => {
    if (!currentUser?.$id) return

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${MESSAGES_TABLE_ID}.rows`,
      ({ events = [], payload }) => {
        if (events.some((event) => event.endsWith('.delete'))) {
          setChatsRefresh((value) => value + 1)
          return
        }

        if (!events.some((event) => event.endsWith('.create'))) return
        if (!payload?.conversationId || !payload?.senderId || !payload?.$createdAt) return

        const updateGroupActivity = (chat) => {
          if (chat.type !== 'group' || chat.id !== payload.conversationId) return chat

          const messageTime = new Date(payload.$createdAt).getTime()

          return {
            ...chat,
            members: chat.members.map((member) => (
              member.userId === payload.senderId &&
                (!Number.isFinite(new Date(member.lastMessageAt).getTime()) ||
                  messageTime > new Date(member.lastMessageAt).getTime())
                ? { ...member, lastMessageAt: payload.$createdAt }
                : member
            )),
          }
        }

        setChats((previous) => previous.map(updateGroupActivity))
        setActiveChat((previous) => previous ? updateGroupActivity(previous) : previous)
      }
    )

    return () => unsubscribe()
  }, [currentUser?.$id])

  useEffect(() => {
    if (!currentUser?.$id) return

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${CONVERSATION_MEMBERS_TABLE_ID}.rows`,
      ({ events = [] }) => {
        if (events.some((event) => (
          event.endsWith('.create') || event.endsWith('.delete')
        ))) {
          setChatsRefresh((value) => value + 1)
        }
      }
    )

    return () => unsubscribe()
  }, [currentUser?.$id])

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
              const memberCount = membersResponse.total ?? members.length
              const memberUserIds = members.map((member) => member.userId)
              let memberProfiles = profiles.filter((item) =>
                memberUserIds.includes(item.userId)
              )
              const missingProfileUserIds = memberUserIds.filter(
                (userId) => !memberProfiles.some((item) => item.userId === userId)
              )

              if (missingProfileUserIds.length > 0) {
                const additionalProfilesResponse = await tablesDB.listRows({
                  databaseId: DATABASE_ID,
                  tableId: USERS_TABLE_ID,
                  queries: [
                    Query.equal('userId', missingProfileUserIds),
                    Query.limit(100),
                  ],
                })
                memberProfiles = [...memberProfiles, ...additionalProfilesResponse.rows]
              }

              // Hämta olästa meddelanden som skickats efter senaste läsningen.
              const lastReadAt = membership.lastReadAt || membership.$createdAt

              const unreadResponse = await tablesDB.listRows({
                databaseId: DATABASE_ID,
                tableId: MESSAGES_TABLE_ID,
                queries: [
                  Query.equal('conversationId', [conversation.$id]),
                  Query.greaterThan('$createdAt', lastReadAt),
                  Query.notEqual('senderId', [currentUser.$id]),
                  Query.notEqual('type', ['game_move']),
                  Query.notEqual('type', ['game_invite_response']),
                  Query.limit(1),
                ],
              })

              const unreadCount = unreadResponse.total || 0

              if (conversation.type === 'group') {
                const groupMembers = members.map((member) => {
                  const memberProfile = memberProfiles.find(
                    (item) => item.userId === member.userId
                  )

                  return {
                    userId: member.userId,
                    username: memberProfile?.username || 'Okänd användare',
                    avatarProfile: memberProfile || (
                      member.userId === currentUser.$id ? profile : null
                    ),
                  }
                })
                const groupMembersWithActivity = await addLatestMessageTimes(
                  groupMembers,
                  conversation.$id
                )

                return {
                  id: conversation.$id,
                  type: 'group',
                  name: conversation.name || 'Namnlös grupp',
                  username: conversation.name || 'Namnlös grupp',
                  initials: (conversation.name || 'G').slice(0, 1).toUpperCase(),
                  members: groupMembersWithActivity,
                  memberCount,
                  preview: `${memberCount} medlemmar`,
                  membershipRowId: membership.$id,
                  lastReadAt,
                  unreadCount,
                }
              }

              const otherMember = members.find(
                (member) => member.userId !== currentUser.$id
              )

              if (!otherMember) return null

              const otherProfile = memberProfiles.find(
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
                    avatarProfile: profile || profiles.find(
                      (item) => item.userId === currentUser.$id
                    ),
                  },
                  {
                    userId: otherMember.userId,
                    username,
                    avatarProfile: otherProfile,
                  },
                ],
                avatarProfile: otherProfile,
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

  useEffect(() => {
    if (!currentUser?.$id || loadingChats || activeView === 'games') return

    const conversationId = new URLSearchParams(window.location.search)
      .get('conversationId')
    if (!conversationId) return

    const requestedChat = chats.find(
      (chat) => chat.id === conversationId && chat.type === 'direct'
    )
    if (requestedChat) {
      setActiveChat(requestedChat)
      setActiveView('chat')
    }
  }, [activeView, chats, currentUser?.$id, loadingChats])

  const handleChatRead = useCallback(
    async (membershipRowId, conversationId, latestMessageAt) => {
      if (!membershipRowId || !conversationId || !latestMessageAt || !currentUser?.$id) {
        return { ok: false, message: 'Läspositionen kunde inte sparas.' }
      }

      try {
        // Räkna meddelanden efter den senaste position som faktiskt visats.
        const unreadResponse = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: MESSAGES_TABLE_ID,
          queries: [
            Query.equal('conversationId', [conversationId]),
            Query.greaterThan('$createdAt', latestMessageAt),
            Query.notEqual('senderId', [currentUser.$id]),
            Query.notEqual('type', ['game_move']),
            Query.notEqual('type', ['game_invite_response']),
            Query.limit(500),
          ],
        })

        const unreadCount = unreadResponse.total ?? unreadResponse.rows.length

        // Spara läspositionen i just den här användarens medlemsrad.
        await tablesDB.updateRow({
          databaseId: DATABASE_ID,
          tableId: CONVERSATION_MEMBERS_TABLE_ID,
          rowId: membershipRowId,
          data: {
            lastReadAt: latestMessageAt,
          },
        })

        // Uppdatera både sidomenyn och aktiv chatt direkt efter lyckad lagring.
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

        return { ok: true, unreadCount }
      } catch (error) {
        console.error('Kunde inte markera chatten som läst:', error)

        const permissionProblem = error?.code === 401 || error?.code === 403
        return {
          ok: false,
          message: permissionProblem
            ? 'Lässtatusen kunde inte sparas. Medlemsraden i Appwrite behöver uppdateringsbehörighet för just ditt användarkonto.'
            : `Lässtatusen kunde inte sparas: ${error.message || 'Okänt fel'}`,
        }
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
      await voiceCall.endCall()
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
    if (voiceCall.call && voiceCall.call.conversationId !== chat.id) {
      void voiceCall.endCall()
    }
    // Behåll den sparade läspositionen och eventuella olästa meddelanden.
    // Chat-komponenten flyttar fram läspositionen när meddelanden faktiskt syns.
    setActiveChat(chat)
    setActiveView('chat')
    window.history.replaceState(
      null,
      '',
      `/?conversationId=${encodeURIComponent(chat.id)}`
    )
  }

  function showCamera() {
    if (voiceCall.call) void voiceCall.endCall()
    setActiveChat(null)
    setActiveView('camera')
    window.history.replaceState(null, '', '/')
  }

  function showView(view) {
    if (voiceCall.call) void voiceCall.endCall()
    setActiveChat(null)
    setActiveView(view)
    window.history.replaceState(null, '', '/')
  }

  function showGames(event) {
    const panel = mainPanelRef.current
    const button = event.currentTarget
    if (!panel || gameTransition) return

    const panelRect = panel.getBoundingClientRect()
    const buttonRect = button.getBoundingClientRect()
    const panelLeft = panelRect.left + panel.clientLeft
    const panelTop = panelRect.top + panel.clientTop

    setGameInvite(null)
    setGameReturnView('camera')
    setGameViewEntering(false)
    setGameTransition({
      startLeft: buttonRect.left - panelLeft + panel.scrollLeft,
      startTop: buttonRect.top - panelTop + panel.scrollTop,
      startWidth: buttonRect.width,
      startHeight: buttonRect.height,
      endLeft: panel.scrollLeft,
      endTop: panel.scrollTop,
      endWidth: panel.clientWidth,
      endHeight: panel.clientHeight,
    })
  }

  function finishGameTransition(event) {
    if (event.animationName !== 'games-panel-expand') return

    setGameTransition(null)
    setActiveView('games')
    setGameViewEntering(true)
  }

  function joinGameInvite(invite) {
    setGameTransition(null)
    setGameViewEntering(false)
    setGameInvite(invite)
    setGameReturnView('chat')
    setActiveView('games')
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

  async function saveAvatar(avatarData) {
    if (!profile?.$id) {
      throw new Error('Din användarprofil kunde inte hittas i Appwrite.')
    }

    const updatedProfile = await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: USERS_TABLE_ID,
      rowId: profile.$id,
      data: avatarData,
    })

    setProfile(updatedProfile)
    return updatedProfile
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
              {chat.type === 'group' ? (
                <GroupAvatar
                  members={chat.members}
                  memberCount={chat.memberCount}
                  name={chat.name}
                />
              ) : (
                <ProfileAvatar
                  profile={chat.avatarProfile}
                  userId={chat.otherUserId}
                  name={chat.username}
                  className="chat-avatar"
                />
              )}

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
          <div className="sidebar-bottom-actions">
            <button
              className={`sidebar-action ${
                activeView === 'settings' ? 'selected' : ''
              }`}
              onClick={() => showView('settings')}
            >
              <span className="sidebar-action-icon">⚙</span>
              <span>Inställningar</span>
            </button>
            <button
              type="button"
              className={`profile-settings-button ${activeView === 'avatar-settings' ? 'selected' : ''}`}
              onClick={() => showView('avatar-settings')}
              aria-label="Profilbild och avatarinställningar"
              title="Profilbild och avatarinställningar"
            >
              <ProfileAvatar
                profile={profile}
                userId={currentUser.$id}
                name={profile?.username || currentUser.name}
                size={38}
                className="profile-settings-avatar"
              />
            </button>
          </div>

          <div className="sidebar-footer">
            <span className="footer-dot" />
            <span>@{profile?.username || currentUser.name}</span>
          </div>
        </div>
      </aside>

      <main className="main-panel" ref={mainPanelRef}>
        <div className="mobile-brand">
          <span className="brand-mark">✳</span>
          <span className="brand-name">
            PLOT <strong>TWIST</strong>
          </span>
        </div>

        {activeView === 'camera' && (
          <section className="workspace-view camera-view">
            <Camera currentUser={currentUser} />
            <button
              type="button"
              className="camera-games-button"
              onClick={showGames}
              disabled={Boolean(gameTransition)}
              aria-label="Öppna spel"
              title="Spel"
            >
              <Gamepad2 aria-hidden="true" />
            </button>
          </section>
        )}

        {activeView === 'chat' && (
          <Fragment key={activeChat?.id}>
            <div className="conversation-heading">
              {activeChat?.type === 'group' ? (
                <GroupAvatar
                  members={activeChat.members}
                  memberCount={activeChat.memberCount}
                  name={activeChat.name}
                  size={56}
                  className="large"
                />
              ) : (
                <ProfileAvatar
                  profile={activeChat?.avatarProfile}
                  userId={activeChat?.otherUserId}
                  name={activeChat?.username || activeChat?.name}
                  size={56}
                  className="chat-avatar large"
                />
              )}

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

              {activeChat?.type === 'direct' && !voiceCall.call && (
                <button
                  type="button"
                  className="conversation-call-button"
                  aria-label={`Ring @${activeChat.username || activeChat.name}`}
                  title="Starta röstsamtal"
                  onClick={() => voiceCall.startCall({
                    conversationId: activeChat.id,
                    recipientId: activeChat.otherUserId,
                    recipientName: activeChat.username || activeChat.name,
                    recipientProfile: activeChat.avatarProfile,
                  })}
                >
                  <Phone aria-hidden="true" />
                </button>
              )}
            </div>

            <section className="workspace-view chat-view">
              <div className="conversation-content">
                <Chat
                  chat={activeChat}
                  currentUser={currentUser}
                  onRead={handleChatRead}
                  onAcceptGameInvite={joinGameInvite}
                />
              </div>
            </section>
          </Fragment>
        )}

        {activeView === 'add' && <AddPeople />}

        {activeView === 'games' && (
          <Games
            currentUser={currentUser}
            initialInvite={gameInvite}
            animateIn={gameViewEntering}
            onEntranceAnimationEnd={() => setGameViewEntering(false)}
            onExit={() => {
              setGameInvite(null)
              setActiveView(gameReturnView)
            }}
          />
        )}

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

        {activeView === 'avatar-settings' && (
          <section className="workspace-view avatar-settings-view">
            <AvatarBuilder
              profile={profile}
              userId={currentUser.$id}
              name={profile?.username || currentUser.name}
              onSaved={saveAvatar}
            />
          </section>
        )}

        {gameTransition && (
          <div
            className="games-panel-transition"
            style={{
              '--game-start-left': `${gameTransition.startLeft}px`,
              '--game-start-top': `${gameTransition.startTop}px`,
              '--game-start-width': `${gameTransition.startWidth}px`,
              '--game-start-height': `${gameTransition.startHeight}px`,
              '--game-end-left': `${gameTransition.endLeft}px`,
              '--game-end-top': `${gameTransition.endTop}px`,
              '--game-end-width': `${gameTransition.endWidth}px`,
              '--game-end-height': `${gameTransition.endHeight}px`,
            }}
            onAnimationEnd={finishGameTransition}
            aria-hidden="true"
          >
            <Gamepad2 />
          </div>
        )}
      </main>

      <VoiceCallOverlay
        call={voiceCall.call}
        muted={voiceCall.muted}
        onAnswer={voiceCall.answerCall}
        onReject={() => voiceCall.rejectCall('rejected')}
        onEnd={voiceCall.endCall}
        onToggleMute={voiceCall.toggleMute}
        onDismiss={voiceCall.dismissCall}
      />
    </div>
  )
}
