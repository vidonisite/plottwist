
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Query } from 'appwrite'
import { Gamepad2, Phone, Trophy } from 'lucide-react'
import EventButton from './events/EventButton.jsx'
import { useRegisterSW } from 'virtual:pwa-register/react'
import EventThemeController from './events/EventThemeController.jsx'
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
import GroupDetails from './GroupDetails.jsx'
import Games from './games.jsx'
import AddPeople from './AddPeople.jsx'
import CreateGroup from './CreateGroup.jsx'
import ProfileAvatar from './components/ProfileAvatar.jsx'
import GroupAvatar from './components/GroupAvatar.jsx'
import AvatarBuilder from './components/AvatarBuilder.jsx'
import FeatureAnnouncement from './components/FeatureAnnouncement.jsx'
import { addLatestMessageTimes } from './lib/groupMembers.js'
import useVoiceCall from './hooks/useVoiceCall.js'
import VoiceCallOverlay from './components/VoiceCallOverlay.jsx'

import './App.css'

const NON_UNREAD_MESSAGE_TYPES = new Set([
  'game_move',
  'game_invite_response',
  'game_session_start',
  'game_hangman_state',
  'game_hangman_word',
  'game_hangman_guess',
  'game_hangman_replay',
  'game_memory_turn',
  'game_snake_input',
  'game_snake_state',
])

function conversationIdForLog(membership) {
  return membership?.conversationId || 'okänd konversation'
}

function latestMemberActivityAt(members) {
  return members.reduce((latest, member) => {
    const activityAt = member.lastMessageAt
    return activityAt && (!latest || Date.parse(activityAt) > Date.parse(latest))
      ? activityAt
      : latest
  }, null)
}

function waitForWaitingServiceWorker(registration) {
  if (registration.waiting) return Promise.resolve('waiting')

  const installingWorker = registration.installing
  if (!installingWorker) return Promise.resolve('none')

  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => finish('timeout'), 60_000)

    function finish(result) {
      window.clearTimeout(timeoutId)
      installingWorker.removeEventListener('statechange', checkState)
      resolve(result)
    }

    function checkState() {
      if (registration.waiting) {
        finish('waiting')
      } else if (installingWorker.state === 'installed') {
        finish('none')
      } else if (installingWorker.state === 'redundant') {
        finish('failed')
      }
    }

    installingWorker.addEventListener('statechange', checkState)
    checkState()
  })
}

export default function App() {
  const serviceWorkerRegistrationRef = useRef(null)
  const [checkingForUpdate, setCheckingForUpdate] = useState(false)
  const [updateCheckMessage, setUpdateCheckMessage] = useState('')
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,

    onRegisteredSW: (_swUrl, registration) => {
      if (!registration) return

      serviceWorkerRegistrationRef.current = registration

      // Kontrollera efter nya versioner varje minut.
      window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          registration.update().catch((error) => {
            console.error('Kunde inte kontrollera uppdateringar:', error)
          })
        }
      }, 60 * 1000)
    },

    onRegisterError: (error) => {
      console.error('Kunde inte registrera service workern:', error)
    },
  })

  const [currentUser, setCurrentUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const profileRef = useRef(profile)
  const scoreQueueRef = useRef(Promise.resolve())
  const scoredEventsRef = useRef(new Set())
  const scoreToastTimersRef = useRef(new Map())
  const scoreToastSequenceRef = useRef(0)
  const [scoreToasts, setScoreToasts] = useState([])
  const [checkingSession, setCheckingSession] = useState(true)

  const [activeView, setActiveView] = useState('camera')
  const [activeChat, setActiveChat] = useState(null)
  const [groupDetailsOpen, setGroupDetailsOpen] = useState(false)
  const leaderboardButtonRef = useRef(null)

  const [search, setSearch] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [notifications, setNotifications] = useState(false)
  const [notificationError, setNotificationError] = useState('')
  const [updatingNotifications, setUpdatingNotifications] = useState(false)

  const [loggingOut, setLoggingOut] = useState(false)
  const [authError, setAuthError] = useState('')

  const [chats, setChats] = useState([])
  const chatsRef = useRef(chats)
  const [loadingChats, setLoadingChats] = useState(false)
  const [chatError, setChatError] = useState('')
  const [chatsRefresh, setChatsRefresh] = useState(0)
  const [leaderboard, setLeaderboard] = useState([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [leaderboardError, setLeaderboardError] = useState('')
  const [rankUpAnnouncement, setRankUpAnnouncement] = useState(null)
  const leaderboardSnapshotRef = useRef({ userId: null, rows: [] })
  const [gameInvite, setGameInvite] = useState(null)
  const [gameReturnView, setGameReturnView] = useState('camera')
  const [gameTransition, setGameTransition] = useState(null)
  const [gameViewEntering, setGameViewEntering] = useState(false)
  const mainPanelRef = useRef(null)
  const twistScoreInfoRef = useRef(null)
  const [twistScoreHovered, setTwistScoreHovered] = useState(false)
  const [twistScorePinned, setTwistScorePinned] = useState(false)
  const voiceCall = useVoiceCall(currentUser)

  const checkForAppUpdate = async () => {
    if (checkingForUpdate) return

    setCheckingForUpdate(true)
    setUpdateCheckMessage('Söker efter uppdatering...')

    try {
      const registration =
        serviceWorkerRegistrationRef.current ||
        (await navigator.serviceWorker?.getRegistration())

      if (!registration) {
        throw new Error('Service workern är inte registrerad.')
      }

      serviceWorkerRegistrationRef.current = registration

      if (!registration.waiting) {
        await registration.update()
      }

      const updateState = await waitForWaitingServiceWorker(registration)
      if (updateState === 'waiting') {
        setUpdateCheckMessage('Uppdateringen är klar. Appen startar om...')
        await updateServiceWorker()
      } else if (updateState === 'timeout') {
        setUpdateCheckMessage(
          'Uppdateringen tar längre tid än väntat. Försök igen om en stund.'
        )
      } else if (updateState === 'failed') {
        throw new Error('Service workern kunde inte installeras.')
      } else {
        setUpdateCheckMessage('Du har redan den senaste versionen.')
      }
    } catch (error) {
      console.error('Kunde inte söka efter appuppdateringar:', error)
      setUpdateCheckMessage(
        'Kunde inte söka efter uppdateringar. Kontrollera anslutningen och försök igen.'
      )
    } finally {
      setCheckingForUpdate(false)
    }
  }

  const closeGroupDetails = useCallback(() => setGroupDetailsOpen(false), [])

  useEffect(() => {
    if (!twistScorePinned) return

    function closeOnOutsideClick(event) {
      if (!twistScoreInfoRef.current?.contains(event.target)) {
        setTwistScorePinned(false)
        setTwistScoreHovered(false)
      }
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setTwistScorePinned(false)
        setTwistScoreHovered(false)
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [twistScorePinned])

  useEffect(() => {
    profileRef.current = profile
  }, [profile])

  useEffect(() => {
    chatsRef.current = chats
  }, [chats])

  useEffect(() => () => {
    scoreToastTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    scoreToastTimersRef.current.clear()
  }, [])

  const awardTwistScore = useCallback((points, eventId) => {
    if (!Number.isSafeInteger(points) || points <= 0 || !eventId) {
      return Promise.reject(new Error('Ogiltig Twist Score-händelse.'))
    }

    if (scoredEventsRef.current.has(eventId)) {
      return Promise.resolve(false)
    }

    scoredEventsRef.current.add(eventId)

    const updateScore = async () => {
      let currentProfile = profileRef.current

      if (!currentProfile?.$id && currentUser?.name) {
        const rowId = currentUser.name.trim().toLowerCase()

        currentProfile = await tablesDB.getRow({
          databaseId: DATABASE_ID,
          tableId: USERS_TABLE_ID,
          rowId,
        })

        profileRef.current = currentProfile
      }

      if (!currentProfile?.$id) {
        throw new Error('Din användarprofil kunde inte hittas i Appwrite.')
      }

      const currentScore = Number(currentProfile.twistscore)

      const updatedProfile = await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: USERS_TABLE_ID,
        rowId: currentProfile.$id,
        data: {
          twistscore:
            (Number.isSafeInteger(currentScore) && currentScore >= 0
              ? currentScore
              : 0) + points,
        },
      })

      profileRef.current = updatedProfile
      setProfile(updatedProfile)

      return true
    }

    const result = scoreQueueRef.current.then(updateScore)
    scoreQueueRef.current = result.catch(() => {})

    return result.then((updated) => {
      if (updated) {
        const toastId = ++scoreToastSequenceRef.current

        setScoreToasts((toasts) => [...toasts, { id: toastId, points }])

        const timer = window.setTimeout(() => {
          setScoreToasts((toasts) => toasts.filter((toast) => toast.id !== toastId))
          scoreToastTimersRef.current.delete(toastId)
        }, 2000)

        scoreToastTimersRef.current.set(toastId, timer)
      }

      return updated
    }).catch((error) => {
      scoredEventsRef.current.delete(eventId)
      throw error
    })
  }, [currentUser?.name])

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

        if (event.events?.some((name) => name.endsWith('.delete'))) {
          setLeaderboard((previous) =>
            previous.filter((item) => item.userId !== updatedProfile.userId)
          )
        } else {
          setLeaderboard((previous) => {
            const existingIndex = previous.findIndex(
              (item) => item.userId === updatedProfile.userId
            )

            if (existingIndex === -1) return [...previous, updatedProfile]

            return previous.map((item, index) =>
              index === existingIndex ? updatedProfile : item
            )
          })
        }

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
              ? {
                ...member,
                username: updatedProfile.username || member.username,
                twistscore: updatedProfile.twistscore ?? member.twistscore,
                avatarProfile: updatedProfile,
              }
              : member
          ),
          twistscore:
            chat.otherUserId === updatedProfile.userId
              ? updatedProfile.twistscore ?? chat.twistscore
              : chat.twistscore,
        })

        setChats((previous) => previous.map(applyProfile))
        setActiveChat((previous) => previous ? applyProfile(previous) : previous)
      }
    )

    return () => unsubscribe()
  }, [currentUser?.$id])

  useEffect(() => {
    if (!currentUser?.$id) return

    let cancelled = false

    async function loadLeaderboard() {
      setLeaderboardLoading(true)
      setLeaderboardError('')

      try {
        const rows = []
        let cursorAfter = null

        while (true) {
          const queries = [Query.limit(5000), Query.orderAsc('$id')]
          if (cursorAfter) queries.push(Query.cursorAfter(cursorAfter))

          const response = await tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: USERS_TABLE_ID,
            queries,
          })

          rows.push(...response.rows)
          if (response.rows.length < 5000) break

          cursorAfter = response.rows[response.rows.length - 1].$id
        }

        if (!cancelled) setLeaderboard(rows)
      } catch (error) {
        console.error('Kunde inte hämta leaderboarden:', error)
        if (!cancelled) {
          setLeaderboardError('Kunde inte hämta leaderboarden. Försök igen senare.')
        }
      } finally {
        if (!cancelled) setLeaderboardLoading(false)
      }
    }

    void loadLeaderboard()

    return () => {
      cancelled = true
    }
  }, [currentUser?.$id])

  useEffect(() => {
    if (!currentUser?.$id) return

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${MESSAGES_TABLE_ID}.rows`,
      ({ events = [], payload }) => {
        if (events.some((event) => event.endsWith('.delete'))) {
          if (chatsRef.current.some((chat) => chat.id === payload?.conversationId)) {
            setChatsRefresh((value) => value + 1)
          }
          return
        }

        if (!events.some((event) => event.endsWith('.create'))) return
        if (!payload?.conversationId || !payload?.senderId || !payload?.$createdAt) return

        const updateChatActivity = (chat) => {
          if (chat.id !== payload.conversationId) return chat

          const messageTime = new Date(payload.$createdAt).getTime()
          const currentActivityTime = chat.lastActivityAt
            ? new Date(chat.lastActivityAt).getTime()
            : 0
          const lastReadTime = chat.lastReadAt
            ? new Date(chat.lastReadAt).getTime()
            : 0

          const countsAsUnread =
            payload.senderId !== currentUser.$id &&
            !NON_UNREAD_MESSAGE_TYPES.has(payload.type) &&
            Number.isFinite(messageTime) &&
            messageTime > lastReadTime

          return {
            ...chat,
            lastActivityAt:
              Number.isFinite(messageTime) && messageTime > currentActivityTime
                ? payload.$createdAt
                : chat.lastActivityAt,
            unreadCount: countsAsUnread
              ? (chat.unreadCount || 0) + 1
              : chat.unreadCount,
            ...(chat.type === 'group'
              ? {
                members: chat.members.map((member) => (
                  member.userId === payload.senderId &&
                    (!Number.isFinite(new Date(member.lastMessageAt).getTime()) ||
                      messageTime > new Date(member.lastMessageAt).getTime())
                    ? { ...member, lastMessageAt: payload.$createdAt }
                    : member
                )),
              }
              : {}),
          }
        }

        setChats((previous) => previous.map(updateChatActivity))
        setActiveChat((previous) => previous ? updateChatActivity(previous) : previous)
      }
    )

    return () => unsubscribe()
  }, [currentUser?.$id])

  useEffect(() => {
    if (!currentUser?.$id) return

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${CONVERSATION_MEMBERS_TABLE_ID}.rows`,
      ({ events = [], payload }) => {
        const wasCreated = events.some((event) => event.endsWith('.create'))
        const wasDeleted = events.some((event) => event.endsWith('.delete'))
        const membershipChanged = wasCreated || wasDeleted
        const isCurrentUserMembership =
          payload?.userId === currentUser.$id
        const affectsKnownConversation = chatsRef.current.some(
          (chat) => chat.id === payload?.conversationId
        )

        if (
          wasDeleted &&
          isCurrentUserMembership
        ) {
          setChats((previous) =>
            previous.filter((chat) => chat.id !== payload.conversationId)
          )
        } else if (
          membershipChanged &&
          (wasCreated && isCurrentUserMembership || affectsKnownConversation)
        ) {
          setChatsRefresh((value) => value + 1)
        }

        if (
          wasDeleted &&
          isCurrentUserMembership &&
          payload?.conversationId === activeChat?.id &&
          activeChat?.type === 'group'
        ) {
          setGroupDetailsOpen(false)
          setActiveChat(null)
          setActiveView('camera')
          window.history.replaceState(null, '', '/')
        }
      }
    )

    return () => unsubscribe()
  }, [currentUser?.$id, activeChat?.id, activeChat?.type])

  // Hämta konversationerna i större batchar i stället för att göra
  // separata medlems-, profil- och konversationshämtningar för varje chatt.
  useEffect(() => {
    if (!currentUser?.$id) {
      setChats([])
      return
    }

    let cancelled = false

    async function loadChats() {
      setLoadingChats(true)
      setChatError('')

      try {
        // Först hämtas användarens medlemsrader. De ger alla conversationId.
        const membershipsResponse = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: CONVERSATION_MEMBERS_TABLE_ID,
          queries: [
            Query.equal('userId', [currentUser.$id]),
            Query.limit(100),
          ],
        })

        const memberships = membershipsResponse.rows
        const conversationIds = [...new Set(
          memberships.map((membership) => membership.conversationId).filter(Boolean)
        )]

        if (conversationIds.length === 0) {
          if (!cancelled) {
            setChats([])
          }
          return
        }

        // Hämta alla konversationer och alla medlemsrader i två batchar.
        const [conversationsResponse, allMembersResponse] = await Promise.all([
          tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: CONVERSATIONS_TABLE_ID,
            queries: [
              Query.equal('$id', conversationIds),
              Query.limit(100),
            ],
          }),
          tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: CONVERSATION_MEMBERS_TABLE_ID,
            queries: [
              Query.equal('conversationId', conversationIds),
              Query.limit(5000),
            ],
          }),
        ])

        const conversationsById = new Map(
          conversationsResponse.rows.map((conversation) => [conversation.$id, conversation])
        )
        const membersByConversation = new Map()
        const allMemberUserIds = new Set([currentUser.$id])

        for (const member of allMembersResponse.rows) {
          if (!membersByConversation.has(member.conversationId)) {
            membersByConversation.set(member.conversationId, [])
          }

          membersByConversation.get(member.conversationId).push(member)

          if (member.userId) allMemberUserIds.add(member.userId)
        }

        // Hämta bara profilerna som faktiskt behövs för dessa konversationer.
        const profilesResponse = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: USERS_TABLE_ID,
          queries: [
            Query.equal('userId', [...allMemberUserIds]),
            Query.limit(5000),
          ],
        })

        const profilesByUserId = new Map(
          profilesResponse.rows.map((item) => [item.userId, item])
        )

        if (profileRef.current?.userId) {
          profilesByUserId.set(profileRef.current.userId, profileRef.current)
        }

        const loadedChats = await Promise.all(
          memberships.map(async (membership) => {
            try {
              const conversation = conversationsById.get(membership.conversationId)

              if (!conversation) {
                throw new Error('Konversationen kunde inte hittas.')
              }

              const members = membersByConversation.get(conversation.$id) || []
              const memberCount = members.length

              // Olästa meddelanden räknas fortfarande separat per konversation.
              // Det bevarar den befintliga läslogiken och filtreringen av spelhändelser.
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
                  Query.notEqual('type', ['game_session_start']),
                  Query.notEqual('type', ['game_hangman_state']),
                  Query.notEqual('type', ['game_hangman_word']),
                  Query.notEqual('type', ['game_hangman_guess']),
                  Query.notEqual('type', ['game_hangman_replay']),
                  Query.notEqual('type', ['game_memory_turn']),
                  Query.notEqual('type', ['game_snake_input']),
                  Query.notEqual('type', ['game_snake_state']),
                  Query.limit(1),
                ],
              })

              const unreadCount = unreadResponse.total || 0

              if (conversation.type === 'group') {
                const groupMembers = members.map((member) => {
                  const memberProfile = profilesByUserId.get(member.userId)

                  return {
                    userId: member.userId,
                    username: memberProfile?.username || 'Okänd användare',
                    twistscore: memberProfile?.twistscore ?? 0,
                    avatarProfile: memberProfile || (
                      member.userId === currentUser.$id ? profileRef.current : null
                    ),
                  }
                })

                const groupMembersWithActivity = await addLatestMessageTimes(
                  groupMembers,
                  conversation.$id
                )

                const lastActivityAt = latestMemberActivityAt(groupMembersWithActivity)

                return {
                  id: conversation.$id,
                  type: 'group',
                  name: conversation.name || 'Namnlös grupp',
                  username: conversation.name || 'Namnlös grupp',
                  initials: (conversation.name || 'G').slice(0, 1).toUpperCase(),
                  members: groupMembersWithActivity,
                  memberCount,
                  preview: `${memberCount} medlemmar`,
                  lastActivityAt,
                  membershipRowId: membership.$id,
                  lastReadAt,
                  unreadCount,
                }
              }

              const otherMember = members.find(
                (member) => member.userId !== currentUser.$id
              )

              if (!otherMember) return null

              const otherProfile = profilesByUserId.get(otherMember.userId)
              const username = otherProfile?.username || 'Okänd användare'

              const latestMessageResponse = await tablesDB.listRows({
                databaseId: DATABASE_ID,
                tableId: MESSAGES_TABLE_ID,
                queries: [
                  Query.equal('conversationId', [conversation.$id]),
                  Query.orderDesc('$createdAt'),
                  Query.limit(1),
                ],
              })

              return {
                id: conversation.$id,
                type: 'direct',
                name: username,
                username,
                twistscore: otherProfile?.twistscore ?? 0,
                otherUserId: otherMember.userId,
                initials: username.slice(0, 1).toUpperCase(),
                members: [
                  {
                    userId: currentUser.$id,
                    username: profileRef.current?.username || currentUser.name || 'Du',
                    twistscore: profileRef.current?.twistscore ?? 0,
                    avatarProfile: profileRef.current || profilesByUserId.get(currentUser.$id),
                  },
                  {
                    userId: otherMember.userId,
                    username,
                    twistscore: otherProfile?.twistscore ?? 0,
                    avatarProfile: otherProfile,
                  },
                ],
                avatarProfile: otherProfile,
                memberCount: 2,
                preview: 'Privat konversation',
                lastActivityAt: latestMessageResponse.rows[0]?.$createdAt || null,
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
                  `Kunde inte läsa konversationen: ${error.message || 'Okänt fel'}`
                )
              }

              return null
            }
          })
        )

        if (cancelled) return

        const uniqueChats = Array.from(
          new Map(
            loadedChats.filter(Boolean).map((chat) => [chat.id, chat])
          ).values()
        )

        setChats(uniqueChats)

        setActiveChat((previous) => {
          if (!previous) return previous
          return uniqueChats.find((chat) => chat.id === previous.id) || previous
        })
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
  }, [currentUser?.$id, chatsRefresh])

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
            Query.notEqual('type', ['game_session_start']),
            Query.notEqual('type', ['game_hangman_state']),
            Query.notEqual('type', ['game_hangman_word']),
            Query.notEqual('type', ['game_hangman_guess']),
            Query.notEqual('type', ['game_hangman_replay']),
            Query.notEqual('type', ['game_memory_turn']),
            Query.notEqual('type', ['game_snake_input']),
            Query.notEqual('type', ['game_snake_state']),
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
      setGroupDetailsOpen(false)
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

    const matchingChats = query
      ? chats.filter((chat) => chat.name.toLowerCase().includes(query))
      : chats

    return [...matchingChats].sort((a, b) => {
      const activityDifference =
        (Date.parse(b.lastActivityAt || '') || 0) -
        (Date.parse(a.lastActivityAt || '') || 0)

      return activityDifference || a.name.localeCompare(b.name)
    })
  }, [chats, search])

  const twistScore = Number.isSafeInteger(Number(profile?.twistscore))
    ? Number(profile.twistscore)
    : 0
  const sortedLeaderboard = useMemo(
    () => [...leaderboard].sort((a, b) => {
      const scoreA = Number(a.twistscore)
      const scoreB = Number(b.twistscore)
      const safeScoreA = Number.isSafeInteger(scoreA) && scoreA >= 0 ? scoreA : 0
      const safeScoreB = Number.isSafeInteger(scoreB) && scoreB >= 0 ? scoreB : 0

      return safeScoreB - safeScoreA ||
        (a.username || '').localeCompare(b.username || '')
    }),
    [leaderboard]
  )

  useEffect(() => {
    const userId = currentUser?.$id
    if (!userId || sortedLeaderboard.length === 0) return

    const previousSnapshot = leaderboardSnapshotRef.current
    if (previousSnapshot.userId !== userId) {
      leaderboardSnapshotRef.current = { userId, rows: sortedLeaderboard }
      return
    }

    const previousIndex = previousSnapshot.rows.findIndex(
      (user) => user.userId === userId
    )
    const currentIndex = sortedLeaderboard.findIndex(
      (user) => user.userId === userId
    )

    if (previousIndex !== -1 && currentIndex !== -1) {
      const previousScore = Number(previousSnapshot.rows[previousIndex].twistscore)
      const currentScore = Number(sortedLeaderboard[currentIndex].twistscore)

      if (currentIndex < previousIndex && currentScore > previousScore) {
        const firstVisibleIndex = Math.max(0, currentIndex - 1)

        setRankUpAnnouncement({
          currentRank: currentIndex + 1,
          firstVisibleRank: firstVisibleIndex + 1,
          previousRank: previousIndex + 1,
          rows: sortedLeaderboard.slice(
            firstVisibleIndex,
            Math.max(currentIndex + 2, previousIndex + 1)
          ),
        })
      }
    }

    leaderboardSnapshotRef.current = { userId, rows: sortedLeaderboard }
  }, [currentUser?.$id, sortedLeaderboard])

  useEffect(() => {
    if (!rankUpAnnouncement) return

    const timeout = window.setTimeout(() => {
      setRankUpAnnouncement(null)
    }, 5000)

    return () => window.clearTimeout(timeout)
  }, [rankUpAnnouncement])

  function showRankClimbPreview() {
    if (profile?.admin !== true) return

    const userIndex = sortedLeaderboard.findIndex(
      (user) => user.userId === currentUser.$id
    )
    const user = userIndex >= 0
      ? sortedLeaderboard[userIndex]
      : {
        ...profile,
        $id: profile.$id || currentUser.$id,
        userId: currentUser.$id,
        username: profile.username || currentUser.name,
      }
    const otherUsers = sortedLeaderboard.filter(
      (item) => item.userId !== currentUser.$id
    )
    const previewOthers = otherUsers.length > 0
      ? otherUsers
      : [{
        $id: 'rank-climb-preview-example',
        userId: 'rank-climb-preview-example',
        username: 'Exempelspelare',
        twistscore: 0,
      }]
    const climbedRows = userIndex > 0
      ? [...sortedLeaderboard]
      : [user, ...previewOthers]
    const targetIndex = userIndex > 0 ? userIndex - 1 : 0

    if (userIndex > 0) {
      climbedRows.splice(userIndex, 1)
      climbedRows.splice(targetIndex, 0, user)
    }

    const firstVisibleIndex = Math.max(0, targetIndex - 1)

    setRankUpAnnouncement({
      currentRank: targetIndex + 1,
      firstVisibleRank: firstVisibleIndex + 1,
      isPreview: true,
      previousRank: userIndex > 0 ? userIndex + 1 : 2,
      rows: climbedRows.slice(firstVisibleIndex, targetIndex + 2),
    })
  }

  function openChat(chat) {
    if (voiceCall.call && voiceCall.call.conversationId !== chat.id) {
      void voiceCall.endCall()
    }

    setGroupDetailsOpen(false)

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

    setGroupDetailsOpen(false)
    setActiveChat(null)
    setActiveView('camera')

    window.history.replaceState(null, '', '/')
  }

  function showView(view) {
    if (voiceCall.call) void voiceCall.endCall()

    setGroupDetailsOpen(false)
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
    setGroupDetailsOpen(false)
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
      <>
        <EventThemeController />

        <main className="auth-screen">
          <section className="auth-card">
            <div className="auth-brand">
              <span className="auth-brand-mark">✳</span>
              <span>PLOT <em>TWIST</em></span>
            </div>

            <p className="auth-description">Kontrollerar din session...</p>
          </section>
        </main>
      </>
    )
  }

  if (!currentUser) {
    return (
      <>
        <EventThemeController />

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
    <>
      {/* EventThemeController måste vara monterad oavsett vilken vy som visas. */}
      <EventThemeController isAdmin={profile?.admin === true} />

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
                  <strong className="chat-name-line">
                    <span className="chat-name-text">{chat.name}</span>
                  </strong>

                  <small>{chat.preview}</small>
                </span>

                {chat.unreadCount > 0 && (
                  <span
                    className="unread-badge"
                    aria-label={`${chat.unreadCount} olästa meddelanden`}
                  >
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

              <div className="feature-announcement-anchor">
                <button
                  type="button"
                  className={`profile-settings-button leaderboard-menu-button ${
                    activeView === 'leaderboard' ? 'selected' : ''
                  }`}
                  ref={leaderboardButtonRef}
                  onClick={() => showView('leaderboard')}
                  aria-label="Öppna leaderboard"
                  title="Leaderboard"
                >
                  <Trophy aria-hidden="true" />
                </button>
                <FeatureAnnouncement
                  announcementId="leaderboard"
                  userId={currentUser.$id}
                  active={activeView === 'leaderboard'}
                  targetRef={leaderboardButtonRef}
                  title="Leaderboard"
                  description="Se hur din Twist Score står sig mot andra."
                />
              </div>

              <button
                type="button"
                className={`profile-settings-button ${
                  activeView === 'avatar-settings' ? 'selected' : ''
                }`}
                onClick={() => showView('avatar-settings')}
                aria-label={`Profilbild och avatarinställningar. Twist Score: ${twistScore}`}
                title={`Twist Score: ${twistScore}`}
              >
                <ProfileAvatar
                  profile={profile}
                  userId={currentUser.$id}
                  name={profile?.username || currentUser.name}
                  size={38}
                  className="profile-settings-avatar"
                />

                <span className="profile-score-badge" aria-hidden="true">
                  {twistScore}
                </span>
              </button>
            </div>

            <div className="sidebar-footer">
              <span className="footer-dot" />

              <span>
                @{profile?.username || currentUser.name}
                {' · Twist Score: '}
                {twistScore}
              </span>
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
              <Camera currentUser={currentUser} onScore={awardTwistScore} />

              <EventButton
                disabled={Boolean(gameTransition)}
                isAdmin={profile?.admin === true}
              />

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
            <div className="conversation-views-viewport">
              <div
                key={activeChat?.id}
                className={`conversation-screen-track ${
                  groupDetailsOpen ? 'show-group-details' : ''
                }`}
              >
                {/* CHATTSIDAN – den här komponenten förblir monterad */}
                <section
                  className="conversation-screen chat-screen"
                  aria-hidden={groupDetailsOpen}
                  inert={groupDetailsOpen}
                >
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
                          ? (
                            <button
                              type="button"
                              className="conversation-group-name-button"
                              onClick={() => setGroupDetailsOpen(true)}
                              aria-label={`Visa information om gruppen ${activeChat.name}`}
                            >
                              {activeChat.name}
                            </button>
                          )
                          : (
                            <span className="chat-name-line">
                              <span className="chat-name-text">
                                @{activeChat?.username || activeChat?.name || 'Din chatt'}
                              </span>

                              <div
                                ref={twistScoreInfoRef}
                                className={`twist-score-info ${
                                  twistScoreHovered || twistScorePinned ? 'is-open' : ''
                                }`}
                                onPointerEnter={() => setTwistScoreHovered(true)}
                                onPointerLeave={() => setTwistScoreHovered(false)}
                              >
                                <button
                                  type="button"
                                  className="twist-score-badge"
                                  aria-label={`Twist Score ${activeChat?.twistscore ?? 0}`}
                                  aria-expanded={twistScoreHovered || twistScorePinned}
                                  aria-controls="twist-score-tooltip"
                                  onClick={() => setTwistScorePinned((open) => !open)}
                                >
                                  ☀️{activeChat?.twistscore ?? 0}
                                </button>

                                <div
                                  id="twist-score-tooltip"
                                  className="twist-score-tooltip"
                                  role="note"
                                >
                                  <strong>Twist Score ☀️</strong>
                                  <p>
                                    skicka en bild - 1p<br />
                                    skicka en video - 1p per sekund<br />
                                    kolla på någons twist - 1p<br />
                                    spela - 1p<br />
                                    vinna spelet - 1p extra
                                  </p>
                                </div>
                              </div>
                            </span>
                          )}
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
                        onScore={awardTwistScore}
                      />
                    </div>
                  </section>
                </section>

                {/* GRUPPINFORMATION – visas som en sida bredvid chatten */}
                <section
                  className="conversation-screen group-screen"
                  aria-hidden={!groupDetailsOpen}
                  inert={!groupDetailsOpen}
                >
                  {activeChat?.type === 'group' && (
                    <GroupDetails
                      group={activeChat}
                      currentUser={currentUser}
                      isActive={groupDetailsOpen}
                      onClose={closeGroupDetails}
                      onLeave={() => {
                        setGroupDetailsOpen(false)
                        setChats((previous) =>
                          previous.filter((chat) => chat.id !== activeChat?.id)
                        )
                        setActiveChat(null)
                        setActiveView('camera')
                        window.history.replaceState(null, '', '/')
                      }}
                    />
                  )}
                </section>
              </div>
            </div>
          )}

          {activeView === 'add' && <AddPeople />}

          {activeView === 'games' && (
            <Games
              currentUser={currentUser}
              onScore={awardTwistScore}
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

              <div className="settings-card settings-update-card">
                <div>
                  <strong>Appuppdatering</strong>
                  <p className="setting-help">
                    Sök efter och installera den senaste versionen direkt.
                  </p>
                </div>
                <button
                  type="button"
                  className="accent-button settings-update-button"
                  onClick={checkForAppUpdate}
                  disabled={checkingForUpdate}
                  aria-busy={checkingForUpdate}
                >
                  {checkingForUpdate ? 'Söker...' : 'Sök efter uppdatering'}
                </button>
                {updateCheckMessage && (
                  <p className="setting-help" role="status">
                    {updateCheckMessage}
                  </p>
                )}
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

              {profile?.admin === true && (
                <div className="settings-card rank-climb-settings-card">
                  <div>
                    <strong>Leaderboard-förhandsvisning</strong>
                    <p className="setting-help">
                      Se hur det ser ut när du klättrar upp. Inga poäng ändras.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="accent-button rank-climb-preview-button"
                    onClick={showRankClimbPreview}
                  >
                    Visa förhandsvisning
                  </button>
                </div>
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

          {activeView === 'leaderboard' && (
            <section className="workspace-view simple-view leaderboard-view">
              <div className="view-symbol purple-symbol">
                <Trophy aria-hidden="true" />
              </div>
              <h1>Leaderboard</h1>
              <p className="view-description">
                Alla användare sorterade efter Twist Score.
              </p>

              {leaderboardLoading && (
                <p className="leaderboard-message">Laddar leaderboard...</p>
              )}

              {leaderboardError && (
                <p className="leaderboard-message leaderboard-error" role="alert">
                  {leaderboardError}
                </p>
              )}

              {!leaderboardLoading && !leaderboardError &&
                sortedLeaderboard.length === 0 && (
                  <p className="leaderboard-message">
                    Det finns inga användare att visa ännu.
                  </p>
                )}

              {!leaderboardLoading && !leaderboardError &&
                sortedLeaderboard.length > 0 && (
                <ol className="leaderboard-list">
                  {sortedLeaderboard.map((user, index) => {
                    const score = Number(user.twistscore)
                    const safeScore =
                      Number.isSafeInteger(score) && score >= 0 ? score : 0

                    return (
                      <li className="leaderboard-item" key={user.$id}>
                        <span
                          className={`leaderboard-rank ${
                            index < 3 ? `leaderboard-rank-${index + 1}` : ''
                          }`}
                        >
                          {index + 1}
                        </span>
                        <ProfileAvatar
                          profile={user}
                          userId={user.userId}
                          name={user.username || 'Okänd användare'}
                          size={44}
                          className="leaderboard-avatar"
                        />
                        <span className="leaderboard-username">
                          @{user.username || 'Okänd användare'}
                        </span>
                        <span className="leaderboard-score">
                          {safeScore} <span aria-label="Twist Score">☀️</span>
                        </span>
                      </li>
                    )
                  })}
                </ol>
              )}
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

        {needRefresh && (
          <div className="pwa-update-card" role="status">
            <div className="pwa-update-icon">✳</div>

            <div className="pwa-update-content">
              <strong>Uppdatera PLOT TWIST</strong>

              <p>
                En ny version är klar. Omstarten tar bara några sekunder.
              </p>

              <div className="pwa-update-actions">
                <button
                  type="button"
                  className="pwa-update-later"
                  onClick={() => setNeedRefresh(false)}
                >
                  Senare
                </button>

                <button
                  type="button"
                  className="pwa-update-now"
                  onClick={() => updateServiceWorker()}
                >
                  Uppdatera nu
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="twist-score-toasts" aria-live="polite" aria-atomic="false">
          {scoreToasts.map(({ id, points }) => (
            <div className="twist-score-toast" key={id} role="status">
              +{points} Twist Score
            </div>
          ))}
        </div>

        {rankUpAnnouncement && (
          <div className="rank-climb-backdrop">
            <section
              className="rank-climb-preview"
              role="dialog"
              aria-modal="true"
              aria-labelledby="rank-climb-title"
              aria-describedby="rank-climb-description"
            >
              <button
                type="button"
                className="rank-climb-close"
                aria-label="Stäng leaderboard-förhandsvisningen"
                onClick={() => setRankUpAnnouncement(null)}
              >
                ×
              </button>
              <span className="rank-climb-label">
                {rankUpAnnouncement.isPreview ? 'Förhandsvisning' : 'Leaderboard'}
              </span>
              <h2 id="rank-climb-title">Du klättrar!</h2>
              <p id="rank-climb-description">
                {rankUpAnnouncement.isPreview ? 'Exempel: ' : 'Du gick från '}
                plats {rankUpAnnouncement.previousRank} till{' '}
                {rankUpAnnouncement.currentRank}.
                {rankUpAnnouncement.isPreview && ' Inga poäng har ändrats.'}
              </p>
              <ol className="leaderboard-list rank-climb-list">
                {rankUpAnnouncement.rows.map((user, index) => {
                  const score = Number(user.twistscore)
                  const safeScore =
                    Number.isSafeInteger(score) && score >= 0 ? score : 0
                  const isCurrentUser = user.userId === currentUser?.$id
                  const rank = rankUpAnnouncement.firstVisibleRank + index
                  const isDisplaced = rank > rankUpAnnouncement.currentRank &&
                    rank <= rankUpAnnouncement.previousRank
                  const climbDistance =
                    rankUpAnnouncement.previousRank - rankUpAnnouncement.currentRank
                  const climbOffset = Array(climbDistance)
                    .fill('100% + 8px')
                    .join(' + ')

                  return (
                    <li
                      className={`leaderboard-item rank-climb-item${
                        isCurrentUser ? ' rank-climb-item--current' : ''
                      }${
                        isDisplaced ? ' rank-climb-item--displaced' : ''
                      }`}
                      style={isCurrentUser
                        ? { '--rank-climb-start-offset': `calc(${climbOffset})` }
                        : undefined}
                      key={user.$id}
                    >
                      {isCurrentUser && (
                        <>
                          <span className="rank-climb-sparkle" aria-hidden="true">✦</span>
                          <span className="rank-climb-sparkle" aria-hidden="true">✧</span>
                          <span className="rank-climb-sparkle" aria-hidden="true">✦</span>
                        </>
                      )}
                      <span className="leaderboard-rank">
                        {rank}
                      </span>
                      <ProfileAvatar
                        profile={user}
                        userId={user.userId}
                        name={user.username || 'Okänd användare'}
                        size={44}
                        className="leaderboard-avatar"
                      />
                      <span className="leaderboard-username">
                        @{user.username || 'Okänd användare'}
                        {isCurrentUser ? ' (du)' : ''}
                      </span>
                      <span className="leaderboard-score">
                        {safeScore} <span aria-label="Twist Score">☀️</span>
                      </span>
                    </li>
                  )
                })}
              </ol>
              <p className="rank-climb-hint">
                {rankUpAnnouncement.isPreview
                  ? 'Det här är bara en visning — inga poäng sparas.'
                  : 'Förhandsvisningen stängs automatiskt.'}
              </p>
            </section>
          </div>
        )}
      </div>
    </>
  )
}
