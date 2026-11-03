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

import './TwistMessage.css'

export default function TwistMessage({ message, currentUserId, isMine }) {
  const [hasOpened, setHasOpened] = useState(false)
  const [checking, setChecking] = useState(true)
  const [opening, setOpening] = useState(false)
  const [mediaUrl, setMediaUrl] = useState('')
  const [mediaType, setMediaType] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const messageId = message.$id

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
    } catch (error) {
      console.error('Kunde inte kontrollera Twist-status:', error)
      setErrorMessage('Kunde inte kontrollera om Twisten har öppnats.')
    } finally {
      setChecking(false)
    }
  }, [messageId, currentUserId, isMine])

  useEffect(() => {
    checkIfOpened()

    if (isMine) return

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${MESSAGE_READS_TABLE_ID}.rows`,
      (event) => {
        const row = event.payload

        if (
          row?.messageId === messageId &&
          row?.userId === currentUserId
        ) {
          setHasOpened(true)
        }
      }
    )

    return () => unsubscribe()
  }, [checkIfOpened, messageId, currentUserId, isMine])

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

  async function openTwist() {
    if (opening || hasOpened || !currentUserId) return

    setOpening(true)
    setErrorMessage('')

    try {
      // Hämta filens information.
      const file = await storage.getFile({
        bucketId: TWISTS_BUCKET_ID,
        fileId: message.text,
      })

      // Hämta filens visningsadress.
      const url = storage.getFileView({
        bucketId: TWISTS_BUCKET_ID,
        fileId: message.text,
      })

      // Spara öppningen innan innehållet visas.
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

      setHasOpened(true)
      setMediaType(file.mimeType?.startsWith('video/') ? 'video' : 'image')
      setMediaUrl(url.toString())
    } catch (error) {
      console.error('Kunde inte öppna Twist:', error)

      // Om raden redan hann skapas, kontrollera statusen igen.
      await checkIfOpened()

      setErrorMessage(
        'Twisten kunde inte öppnas. Den kan redan vara öppnad eller så uppstod ett anslutningsfel.'
      )
    } finally {
      setOpening(false)
    }
  }

  return (
    <>
      <div className="twist-message">
        {isMine ? (
          <div className="twist-status">
            <span className="twist-status-icon">✳</span>
            <span>TWIST SKICKAD</span>
          </div>
        ) : checking ? (
          <div className="twist-status">Hämtar Twist...</div>
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
              {opening ? 'ÖPPNAR...' : 'TRYCK FÖR ATT ÖPPNA TWIST'}
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
          onClick={() => setMediaUrl('')}
        >
          <button
            className="twist-close"
            onClick={() => setMediaUrl('')}
            aria-label="Stäng Twist"
          >
            ×
          </button>

          <div
            className="twist-media-container"
            onClick={(event) => event.stopPropagation()}
          >
            {mediaType === 'video' ? (
              <video
                src={mediaUrl}
                className="twist-media"
                autoPlay
                playsInline
                controls
              />
            ) : (
              <img
                src={mediaUrl}
                className="twist-media"
                alt="Öppnad Twist"
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
