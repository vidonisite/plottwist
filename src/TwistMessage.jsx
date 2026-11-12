import { useCallback, useEffect, useState } from 'react'
import { Query, Permission, Role } from 'appwrite'

import {
  client,
  tablesDB,
  storage,
  DATABASE_ID,
  MESSAGE_READS_TABLE_ID,
  TWISTS_BUCKET_ID,
} from './lib/appwrite.js'
import { getTwistFile, loadTwistSettings } from './lib/twistMedia.js'
import ProfileAvatar from './components/ProfileAvatar.jsx'

import './TwistMessage.css'

async function stableReadRowId(messageId, userId) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${messageId}:${userId}`)
  )

  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export default function TwistMessage({
  message,
  currentUserId,
  isMine,
  members = [],
  followingTwistIds = [],
  openRequested = false,
  onOpenRequestHandled,
  onOpenNextTwist,
  onScore,
}) {
  const [hasOpened, setHasOpened] = useState(false)
  const [openedByIds, setOpenedByIds] = useState([])
  const [checking, setChecking] = useState(true)
  const [opening, setOpening] = useState(false)
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaType, setMediaType] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [twistSettings, setTwistSettings] = useState(null)
  const [nextTwistId, setNextTwistId] = useState(null)
  const [nextTwistError, setNextTwistError] = useState('')

  const messageId = message.$id
  const followingTwistSignature = JSON.stringify(followingTwistIds)

  // Kontrollera om användaren redan har öppnat Twisten.
  const checkIfOpened = useCallback(async () => {
    if (!messageId || !currentUserId || isMine) {
      setChecking(false)
      return
    }

    try {
      const response = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: MESSAGE_READS_TABLE_ID,
        queries: [
          Query.equal('messageId', [messageId]),
          Query.equal('userId', [currentUserId]),
          Query.limit(1),
        ],
      })

      setHasOpened(response.rows.length > 0)
      setErrorMessage('')
    } catch (error) {
      console.error('Kunde inte kontrollera Twist-status:', error)

      setErrorMessage(
        `Kunde inte kontrollera Twist-statusen. Fel ${error.code || ''}: ${error.message || 'Okänt fel'}`
      )
    } finally {
      setChecking(false)
    }
  }, [messageId, currentUserId, isMine])

  // Kontrollera status och lyssna efter nya öppningar.
  useEffect(() => {
    setChecking(true)
    checkIfOpened()

    if (isMine || !currentUserId) return

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${MESSAGE_READS_TABLE_ID}.rows`,
      (event) => {
        const row = event.payload

        if (
          row?.messageId === messageId &&
          row?.userId === currentUserId
        ) {
          setHasOpened(true)
          setErrorMessage('')
        }
      }
    )

    return () => unsubscribe()
  }, [checkIfOpened, messageId, currentUserId, isMine])

  const loadOpeners = useCallback(async () => {
    if (!messageId || !isMine) return

    try {
      const response = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: MESSAGE_READS_TABLE_ID,
        queries: [
          Query.equal('messageId', [messageId]),
          Query.limit(100),
        ],
      })

      const readerIds = response.rows
        .map((row) => row.userId)
        .filter((userId) => userId && userId !== currentUserId)

      setOpenedByIds((previous) => [
        ...new Set([...previous, ...readerIds]),
      ])
    } catch (error) {
      console.error('Kunde inte hämta vilka som öppnat Twisten:', error)
    }
  }, [messageId, isMine, currentUserId])

  useEffect(() => {
    if (!isMine) return

    loadOpeners()

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${MESSAGE_READS_TABLE_ID}.rows`,
      (event) => {
        const row = event.payload

        if (
          row?.messageId === messageId &&
          row?.userId &&
          row.userId !== currentUserId
        ) {
          setOpenedByIds((previous) =>
            previous.includes(row.userId)
              ? previous
              : [...previous, row.userId]
          )
        }
      }
    )

    return () => unsubscribe()
  }, [isMine, loadOpeners, messageId, currentUserId])

  useEffect(() => {
    return () => {
      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl)
      }
    }
  }, [mediaUrl])

  // Stäng med Escape eller gå vidare till nästa oöppnade Twist.
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        closeTwist()
      } else if (event.key === 'ArrowRight' && nextTwistId) {
        event.preventDefault()
        openNextTwist()
      }
    }

    if (mediaUrl) {
      window.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mediaUrl, nextTwistId])

  useEffect(() => {
    if (!mediaUrl || isMine || !currentUserId || followingTwistIds.length === 0) {
      setNextTwistId(null)
      setNextTwistError('')
      return
    }

    let cancelled = false

    async function findNextUnopenedTwist() {
      setNextTwistId(null)
      setNextTwistError('')

      try {
        for (let offset = 0; offset < followingTwistIds.length; offset += 100) {
          const candidates = followingTwistIds.slice(offset, offset + 100)
          const response = await tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: MESSAGE_READS_TABLE_ID,
            queries: [
              Query.equal('messageId', candidates),
              Query.equal('userId', [currentUserId]),
              Query.limit(candidates.length),
            ],
          })

          const openedIds = new Set(response.rows.map((row) => row.messageId))
          const nextId = candidates.find((candidateId) => !openedIds.has(candidateId))
          if (nextId) {
            if (!cancelled) setNextTwistId(nextId)
            return
          }
        }
      } catch (error) {
        console.error('Kunde inte kontrollera nästa oöppnade Twist:', error)
        if (!cancelled) {
          setNextTwistError('Nästa Twist kunde inte kontrolleras.')
        }
      }
    }

    findNextUnopenedTwist()

    return () => {
      cancelled = true
    }
  }, [mediaUrl, isMine, currentUserId, followingTwistSignature])

  // Öppna Twisten.
  async function openTwist() {
    if (isMine || opening || hasOpened || !currentUserId) return

    setOpening(true)
    setErrorMessage('')

    let objectUrl = ''

    try {
      const settings = await loadTwistSettings(message.text)
      const file = await storage.getFile({
        bucketId: TWISTS_BUCKET_ID,
        fileId: settings.mediaFileId,
      })

      const fileUrl = await storage.getFileView({
        bucketId: TWISTS_BUCKET_ID,
        fileId: settings.mediaFileId,
      })

      const fileData = await client.call(
        'get',
        new URL(fileUrl),
        undefined,
        undefined,
        'arrayBuffer'
      )

      const isVideo = file.mimeType?.startsWith('video/') ||
        file.name?.toLowerCase().endsWith('.webm')
      const mimeType = isVideo
        ? file.mimeType || 'video/webm'
        : file.mimeType?.startsWith('image/')
          ? file.mimeType
          : 'image/jpeg'

      objectUrl = URL.createObjectURL(
        new Blob([fileData], { type: mimeType })
      )

      if (!isMine && !hasOpened) {
        const readRowId = await stableReadRowId(messageId, currentUserId)
        await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: MESSAGE_READS_TABLE_ID,
          rowId: readRowId,
          data: {
            messageId,
            userId: currentUserId,
          },
          permissions: [
            Permission.read(Role.users()),
            Permission.update(Role.user(currentUserId)),
            Permission.delete(Role.user(currentUserId)),
          ],
        })
      }

      setTwistSettings(settings)
      setMediaType(isVideo ? 'video' : 'image')
      setMediaUrl(objectUrl)
      objectUrl = ''
      if (!isMine) {
        setHasOpened(true)
        if (onScore) {
          try {
            await onScore(1, `opened:${messageId}`)
          } catch (error) {
            console.error('Twist Score kunde inte uppdateras efter öppning:', error)
            setErrorMessage(
              `Twisten öppnades, men poängen kunde inte sparas: ${error.message || 'Okänt fel'}`
            )
          }
        }
      }

    } catch (error) {
      console.error('TWIST ERROR:', {
        message: error.message,
        code: error.code,
        type: error.type,
        response: error.response,
      })

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }

      // Kontrollera om öppningsraden redan finns.
      try {
        const response = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: MESSAGE_READS_TABLE_ID,
          queries: [
            Query.equal('messageId', [messageId]),
            Query.equal('userId', [currentUserId]),
            Query.limit(1),
          ],
        })

        if (response.rows.length > 0) {
          setHasOpened(true)
        }
      } catch (checkError) {
        console.error(
          'Kunde inte kontrollera öppningsstatus:',
          checkError
        )
      }

      setErrorMessage(
        `Twisten kunde inte öppnas. Fel ${error.code || ''}: ${error.message || 'Okänt fel'}`
      )
    } finally {
      setOpening(false)
    }
  }

  function openNextTwist() {
    if (!nextTwistId || !onOpenNextTwist) return

    closeTwist()
    onOpenNextTwist(nextTwistId)
  }

  function closeTwist() {
    setMediaUrl('')
    setTwistSettings(null)
  }

  useEffect(() => {
    if (!openRequested) return

    onOpenRequestHandled?.(messageId)
    void openTwist()
  }, [openRequested, messageId, onOpenRequestHandled])

  const openerNames = openedByIds.map((userId) => {
    const username = members.find((member) => member.userId === userId)
      ?.username || 'Okänd användare'

    return username === 'Okänd användare' ? username : `@${username}`
  })
  const twistSender = members.find((member) => member.userId === message.senderId)
  const twistSenderName = twistSender?.username || 'Okänd användare'
  const twistSenderLabel = twistSenderName === 'Okänd användare'
    ? twistSenderName
    : `@${twistSenderName}`

  return (
    <>
      <div className="twist-message">
        {isMine ? (
          <>
            <div
              className={`twist-status ${
                openerNames.length ? 'twist-opened twist-status-readers' : ''
              }`}
            >
              <span className="twist-status-icon">
                {openerNames.length ? '✓' : '✳'}
              </span>
              <span>
                {openerNames.length
                  ? `ÖPPNAD AV ${openerNames.join(', ')}`
                  : 'TWIST SKICKAD'}
              </span>
            </div>
          </>
        ) : checking ? (
          <div className="twist-status">
            Hämtar Twist...
          </div>
        ) : hasOpened ? (
          <div className="twist-status twist-opened">
            <span className="twist-status-icon">✓</span>
            <span>ÖPPNAD</span>
          </div>
        ) : (
          <button
            className="twist-open-button"
            onClick={openTwist}
            disabled={opening}
          >
            <span className="twist-button-icon">✳</span>
            <span>
              {opening
                ? 'ÖPPNAR...'
                : 'TRYCK FÖR ATT ÖPPNA TWIST'}
            </span>
          </button>
        )}

        {errorMessage && (
          <p className="twist-error" role="alert">
            {errorMessage}
          </p>
        )}

        <span className="message-time">
          {new Date(message.$createdAt).toLocaleTimeString('sv-SE', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      {mediaUrl && (
        <div
          className="twist-fullscreen"
          onClick={closeTwist}
        >
          <button
            className="twist-close"
            onClick={closeTwist}
            aria-label="Stäng Twist"
          >
            ×
          </button>

          <div
            className="twist-media-container"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="twist-sender">
              <ProfileAvatar
                profile={twistSender?.avatarProfile}
                userId={message.senderId}
                name={twistSenderName}
                size={40}
                className="twist-sender-avatar"
              />
              <span>{twistSenderLabel}</span>
            </div>
            <div className="twist-media-stage">
              {mediaType === 'video' ? (
                <video
                  src={mediaUrl}
                  className="twist-media"
                  autoPlay
                  playsInline
                  loop
                  muted
                />
              ) : (
                <img
                  src={mediaUrl}
                  className="twist-media"
                  alt="Öppnad Twist"
                />
              )}

              {twistSettings?.text && (
                <div
                  className="twist-text-overlay"
                  style={{
                    top: `${twistSettings.position * 100}%`,
                  }}
                >
                  {twistSettings.text}
                </div>
              )}
            </div>
            {nextTwistError && (
              <p className="twist-navigation-error" role="alert">
                {nextTwistError}
              </p>
            )}
          </div>
          {nextTwistId && (
            <button
              type="button"
              className="twist-next-button"
              onClick={(event) => {
                event.stopPropagation()
                openNextTwist()
              }}
              aria-label="Öppna nästa Twist"
              title="Nästa Twist"
            >
              →
            </button>
          )}
        </div>
      )}
    </>
  )
}
