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

  // Frigör den lokala bildadressen när den inte längre behövs.
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
    if (opening || hasOpened || !currentUserId) return

    setOpening(true)
    setErrorMessage('')

    let objectUrl = ''

    try {
      // Hämta filen med Appwrite SDK.
      // Detta använder den inloggade användarens session.
      const file = await storage.getFile({
        bucketId: TWISTS_BUCKET_ID,
        fileId: message.text,
      })

      // Hämta själva filinnehållet.
      const response = await storage.getFileDownload({
        bucketId: TWISTS_BUCKET_ID,
        fileId: message.text,
      })

      // Skapa en lokal URL som webbläsaren kan visa.
      const blob = response instanceof Blob
        ? response
        : new Blob([response], {
            type: file.mimeType || 'application/octet-stream',
          })

      objectUrl = URL.createObjectURL(blob)

      // Bestäm om filen är en bild eller video.
      const type = file.mimeType?.startsWith('video/')
        ? 'video'
        : 'image'

      // Registrera att användaren har öppnat Twisten.
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

      // Visa Twisten.
      setMediaType(type)
      setMediaUrl(objectUrl)
      objectUrl = ''
      setHasOpened(true)

    } catch (error) {
      console.error('TWIST ERROR:', {
        message: error.message,
        code: error.code,
        type: error.type,
        response: error.response,
      })

      // Om filen hämtades men något annat misslyckades,
      // frigör den tillfälliga URL:en.
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
