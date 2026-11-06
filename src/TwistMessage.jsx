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
import {
  getTwistFile,
  loadTwistSettings,
  saveTwistEdits,
} from './lib/twistMedia.js'
import { encodeVideoAtSpeed } from './lib/videoSpeed.js'

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
  const [mediaReference, setMediaReference] = useState(message.text)
  const [twistSettings, setTwistSettings] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [editPosition, setEditPosition] = useState(0.5)
  const [editPlaybackRate, setEditPlaybackRate] = useState(1)
  const [savingEdits, setSavingEdits] = useState(false)

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
  async function openTwist({ edit = false } = {}) {
    if (opening || (!isMine && hasOpened) || !currentUserId) return

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
      setMediaReference(message.text)
      setEditText(settings.text)
      setEditPosition(settings.position)
      setEditPlaybackRate(settings.playbackRate)
      setIsEditing(edit)
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

  async function saveEdits() {
    if (!isMine || !twistSettings || savingEdits) return

    setSavingEdits(true)
    setErrorMessage('')

    try {
      let videoBlob

      if (
        mediaType === 'video' &&
        editPlaybackRate !== twistSettings.playbackRate
      ) {
        videoBlob = editPlaybackRate === 1
          ? undefined
          : await encodeVideoAtSpeed(
              await getTwistFile(twistSettings.originalFileId),
              editPlaybackRate
            )
      }

      const result = await saveTwistEdits({
        messageId,
        reference: mediaReference,
        settings: {
          ...twistSettings,
          text: editText,
          position: editPosition,
          playbackRate: editPlaybackRate,
        },
        ownerId: currentUserId,
        videoBlob,
      })

      setMediaReference(result.reference)
      setTwistSettings(result.settings)
      setIsEditing(false)

      if (mediaType === 'video' && videoBlob) {
        setMediaUrl(URL.createObjectURL(videoBlob))
      } else if (mediaType === 'video' && editPlaybackRate === 1) {
        setMediaUrl(URL.createObjectURL(
          await getTwistFile(result.settings.mediaFileId)
        ))
      }
    } catch (error) {
      console.error('Twist-redigeringen kunde inte sparas:', error)
      setErrorMessage(
        `Ändringarna kunde inte sparas: ${error.message || 'Okänt fel'}`
      )
    } finally {
      setSavingEdits(false)
    }
  }

  function cancelEdits() {
    if (twistSettings) {
      setEditText(twistSettings.text)
      setEditPosition(twistSettings.position)
      setEditPlaybackRate(twistSettings.playbackRate)
    }
    setIsEditing(false)
  }

  function closeTwist() {
    setMediaUrl('')
    setIsEditing(false)
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
            <button
              className="twist-edit-trigger"
              onClick={() => openTwist({ edit: true })}
              disabled={opening}
            >
              {opening ? 'ÖPPNAR...' : 'Öppna / redigera Twist'}
            </button>
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

              {(isEditing ? editText : twistSettings?.text) && (
                <div
                  className="twist-text-overlay"
                  style={{
                    top: `${(isEditing ? editPosition : twistSettings.position) * 100}%`,
                  }}
                >
                  {isEditing ? editText : twistSettings.text}
                </div>
              )}
            </div>

            {isEditing && (
              <div className="twist-editor">
                <label className="twist-editor-text-label">
                  Text
                  <textarea
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Skriv text på din Twist"
                  />
                </label>

                <label className="twist-editor-position">
                  <span>Placering upp / ner</span>
                  <input
                    type="range"
                    min="10"
                    max="90"
                    value={Math.round(editPosition * 100)}
                    onChange={(event) =>
                      setEditPosition(Number(event.target.value) / 100)
                    }
                  />
                </label>

                {mediaType === 'video' && (
                  <div className="twist-speed-control" role="group" aria-label="Videohastighet">
                    {[0.5, 1, 2].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        aria-pressed={editPlaybackRate === rate}
                        onClick={() => setEditPlaybackRate(rate)}
                      >
                        {rate.toLocaleString('sv-SE')}x
                      </button>
                    ))}
                  </div>
                )}

                {errorMessage && (
                  <p className="twist-editor-error" role="alert">
                    {errorMessage}
                  </p>
                )}

                <div className="twist-editor-actions">
                  <button
                    type="button"
                    onClick={cancelEdits}
                    disabled={savingEdits}
                  >
                    Avbryt
                  </button>
                  <button
                    type="button"
                    onClick={saveEdits}
                    disabled={savingEdits}
                  >
                    {savingEdits ? 'Sparar...' : 'Spara ändringar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
