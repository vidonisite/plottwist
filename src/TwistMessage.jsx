import { useCallback, useEffect, useState } from 'react'
import { ID, Query, Permission, Role } from 'appwrite'

import {
  client,
  tablesDB,
  storage,
  DATABASE_ID,
  MESSAGE_READS_TABLE_ID,
  TWISTS_BUCKET_ID,
} from './lib/appwrite.js'
import { getTwistFile, loadTwistSettings } from './lib/twistMedia.js'

import './TwistMessage.css'

export default function TwistMessage({
  message,
  currentUserId,
  isMine,
  members = [],
}) {
  const [hasOpened, setHasOpened] = useState(false)
  const [openedByIds, setOpenedByIds] = useState([])
  const [checking, setChecking] = useState(true)
  const [opening, setOpening] = useState(false)
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaType, setMediaType] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [twistSettings, setTwistSettings] = useState(null)

  const messageId = message.$id

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

  // Stäng Twist med Escape.
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setMediaUrl('')
      }
    }

    if (mediaUrl) {
      window.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mediaUrl])

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
        await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: MESSAGE_READS_TABLE_ID,
          rowId: ID.unique(),
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
      if (!isMine) setHasOpened(true)

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

  function closeTwist() {
    setMediaUrl('')
    setTwistSettings(null)
  }

  const openerNames = openedByIds.map((userId) => {
    const username = members.find((member) => member.userId === userId)
      ?.username || 'Okänd användare'

    return username === 'Okänd användare' ? username : `@${username}`
  })

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
          </div>
        </div>
      )}
    </>
  )
}
