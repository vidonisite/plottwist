import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ID,
  Permission,
  Query,
  Role,
} from 'appwrite'
import {
  client,
  storage,
  tablesDB,
  DATABASE_ID,
  MESSAGES_TABLE_ID,
  TWISTS_BUCKET_ID,
} from '../lib/appwrite.js'

import './christmasTree.css'

const TREE_IMAGE_URL = '/julgran.svg'
const TREE_MESSAGE_TYPE = 'christmas-tree-photo'
const MAX_PHOTO_SIZE = 8 * 1024 * 1024

function getTreeConversationId(year) {
  return `christmas-tree-${year}`
}

function parseOrnament(row) {
  try {
    const placement = JSON.parse(row.text)
    const x = Number(placement.x)
    const y = Number(placement.y)

    if (
      typeof placement.fileId !== 'string' ||
      !placement.fileId ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      throw new Error('Placeringen saknar giltiga bild- eller koordinatuppgifter.')
    }

    return {
      id: row.$id,
      fileId: placement.fileId,
      x: Math.min(92, Math.max(8, x)),
      y: Math.min(92, Math.max(8, y)),
      createdAt: row.$createdAt,
    }
  } catch (error) {
    console.error('Ett foto på julgranen kunde inte läsas:', error)
    return null
  }
}

export default function ChristmasTree({
  currentUser,
  event,
  pendingPhoto,
  onPendingPhotoChange,
}) {
  const panelRef = useRef(null)
  const treeRef = useRef(null)
  const restingPanelRectRef = useRef(null)
  const focusedPanelRectRef = useRef(null)
  const returnTimerRef = useRef(null)
  const localPhotoUrlsRef = useRef(new Set())
  const [ornaments, setOrnaments] = useState([])
  const [localOrnaments, setLocalOrnaments] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [failedTreeImage, setFailedTreeImage] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [isReturning, setIsReturning] = useState(false)

  const conversationId = event ? getTreeConversationId(event.year) : null

  useEffect(() => {
    setLocalOrnaments([])
    setSelectedPhoto(null)
    setStatusMessage('')
    localPhotoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    localPhotoUrlsRef.current.clear()
  }, [event?.testMode, event?.year])

  useEffect(() => () => {
    localPhotoUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    localPhotoUrlsRef.current.clear()
  }, [])

  useEffect(() => {
    if (!event) {
      onPendingPhotoChange(null)
      setOrnaments([])
      return undefined
    }

    let cancelled = false

    async function loadOrnaments() {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const rows = []
        let cursor = null

        while (true) {
          const queries = [
            Query.equal('conversationId', [conversationId]),
            Query.equal('type', [TREE_MESSAGE_TYPE]),
            Query.orderAsc('$id'),
            Query.limit(100),
          ]

          if (cursor) queries.push(Query.cursorAfter(cursor))

          const response = await tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: MESSAGES_TABLE_ID,
            queries,
          })

          rows.push(...response.rows)
          if (response.rows.length < 100) break
          cursor = response.rows[response.rows.length - 1].$id
        }

        const items = (await Promise.all(rows.map(parseOrnament).filter(Boolean).map(async (row) => {
          try {
            return {
              ...row,
              url: await storage.getFileView({
                bucketId: TWISTS_BUCKET_ID,
                fileId: row.fileId,
              }),
            }
          } catch (error) {
            console.error('Ett foto på julgranen kunde inte hämtas:', error)
            return null
          }
        }))).filter(Boolean).sort((a, b) =>
          Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')
        )

        if (!cancelled) setOrnaments(items)
      } catch (error) {
        console.error('Kunde inte läsa bilderna på julgranen:', error)
        if (!cancelled) {
          setErrorMessage('Bilderna på julgranen kunde inte hämtas. Försök igen.')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.tables.${MESSAGES_TABLE_ID}.rows`,
      (realtimeEvent) => {
        const row = realtimeEvent.payload
        if (
          row?.conversationId === conversationId &&
          row?.type === TREE_MESSAGE_TYPE
        ) {
          void loadOrnaments()
        }
      }
    )

    void loadOrnaments()

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [conversationId, event?.testMode, onPendingPhotoChange, reloadToken])

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const isPlacing = Boolean(pendingPhoto)
    const startRect = isPlacing
      ? restingPanelRectRef.current
      : focusedPanelRectRef.current
    const targetRect = panel.getBoundingClientRect()

    if (isPlacing) {
      setErrorMessage('')
      setStatusMessage('Klicka på en plats på granen där fotot ska hänga.')
      setIsReturning(false)
      window.clearTimeout(returnTimerRef.current)
    } else if (focusedPanelRectRef.current) {
      setIsReturning(true)
      window.clearTimeout(returnTimerRef.current)
      returnTimerRef.current = window.setTimeout(() => {
        setIsReturning(false)
      }, 520)
    }

    if (
      startRect &&
      targetRect.width > 0 &&
      targetRect.height > 0 &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      const offsetX = startRect.left - targetRect.left
      const offsetY = startRect.top - targetRect.top
      const scaleX = startRect.width / targetRect.width
      const scaleY = startRect.height / targetRect.height
      const startTransform = isPlacing
        ? `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${scaleX}, ${scaleY})`
        : `translate(${offsetX}px, ${offsetY}px) scale(${scaleX}, ${scaleY})`

      panel.animate(
        [
          { transform: startTransform, transformOrigin: 'top left' },
          {
            transform: isPlacing ? 'translate(-50%, -50%)' : 'none',
            transformOrigin: 'top left',
          },
        ],
        {
          duration: 520,
          easing: 'cubic-bezier(0.22, 0.75, 0.22, 1)',
        }
      )
    }

    if (isPlacing) {
      focusedPanelRectRef.current = targetRect
    } else {
      restingPanelRectRef.current = targetRect
    }
  }, [Boolean(pendingPhoto)])

  useEffect(() => () => window.clearTimeout(returnTimerRef.current), [])

  useEffect(() => {
    if (!selectedPhoto) return undefined

    function closeOnEscape(keyboardEvent) {
      if (keyboardEvent.key === 'Escape') setSelectedPhoto(null)
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [selectedPhoto])

  if (!event) return null

  async function hangPhotoAt(mouseEvent) {
    if (!pendingPhoto || isUploading) return

    const bounds = treeRef.current?.getBoundingClientRect()
    if (!bounds || (!event.testMode && !currentUser?.$id)) {
      setErrorMessage('Kunde inte välja en plats på granen. Försök igen.')
      return
    }

    if (!pendingPhoto.size || pendingPhoto.size > MAX_PHOTO_SIZE) {
      setErrorMessage('Bilden är tom eller större än 8 MB.')
      return
    }

    const pointerX = mouseEvent.detail === 0
      ? bounds.left + bounds.width / 2
      : mouseEvent.clientX
    const pointerY = mouseEvent.detail === 0
      ? bounds.top + bounds.height / 2
      : mouseEvent.clientY
    const x = Math.min(92, Math.max(8, ((pointerX - bounds.left) / bounds.width) * 100))
    const y = Math.min(92, Math.max(8, ((pointerY - bounds.top) / bounds.height) * 100))

    if (event.testMode) {
      try {
        const url = URL.createObjectURL(pendingPhoto)
        localPhotoUrlsRef.current.add(url)
        setLocalOrnaments((items) => [
          {
            id: ID.unique(),
            x,
            y,
            url,
          },
          ...items,
        ])
        onPendingPhotoChange(null)
        setErrorMessage('')
        setStatusMessage('Bilden är bara sparad lokalt medan testläget är aktivt.')
      } catch (error) {
        console.error('Kunde inte visa testbilden på julgranen:', error)
        setErrorMessage('Bilden kunde inte visas. Försök igen.')
      }
      return
    }

    const fileId = ID.unique()
    const file = new File([pendingPhoto], `christmas-tree-${fileId}.jpg`, {
      type: pendingPhoto.type || 'image/jpeg',
    })

    setIsUploading(true)
    setErrorMessage('')
    try {
      await storage.createFile({
        bucketId: TWISTS_BUCKET_ID,
        fileId,
        file,
        permissions: [
          Permission.read(Role.users()),
          Permission.update(Role.user(currentUser.$id)),
          Permission.delete(Role.user(currentUser.$id)),
        ],
      })

      let url
      let row

      try {
        url = await storage.getFileView({
          bucketId: TWISTS_BUCKET_ID,
          fileId,
        })

        row = await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: MESSAGES_TABLE_ID,
          rowId: ID.unique(),
          data: {
            conversationId,
            senderId: currentUser.$id,
            text: JSON.stringify({ fileId, x, y }),
            type: TREE_MESSAGE_TYPE,
          },
          permissions: [
            Permission.read(Role.users()),
            Permission.delete(Role.user(currentUser.$id)),
          ],
        })
      } catch (error) {
        try {
          await storage.deleteFile({
            bucketId: TWISTS_BUCKET_ID,
            fileId,
          })
        } catch (cleanupError) {
          console.error('En ej publicerad julgransbild kunde inte tas bort:', cleanupError)
        }
        throw error
      }

      setOrnaments((items) => [
        {
          id: row.$id,
          fileId,
          x,
          y,
          url,
          createdAt: row.$createdAt,
        },
        ...items.filter((item) => item.id !== row.$id),
      ])
      onPendingPhotoChange(null)
      setStatusMessage('Fotot hänger nu på julgranen och syns för alla användare.')
    } catch (error) {
      console.error('Kunde inte hänga upp fotot på julgranen:', error)
      setErrorMessage('Fotot kunde inte hängas upp. Kontrollera anslutningen och försök igen.')
      setStatusMessage('')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <>
      <div
        className={`christmas-tree-focus-backdrop${pendingPhoto ? ' is-visible' : ''}`}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        className={`christmas-tree-panel${pendingPhoto ? ' is-placing' : ''}${isReturning ? ' is-returning' : ''}`}
        aria-label="Julgran"
      >
      {pendingPhoto && (
        <p className="christmas-tree-placement-message" role="status">
          Klicka på granen där fotot ska hänga
        </p>
      )}
      <div
        ref={treeRef}
        className={`christmas-tree-artwork${pendingPhoto ? ' is-placing' : ''}`}
        aria-busy={isLoading || isUploading}
      >
        {failedTreeImage ? (
          <div className="christmas-tree-fallback" aria-hidden="true">
            <span />
            <span />
            <span />
            <i />
          </div>
        ) : (
          <img
            className="christmas-tree-image"
            src={TREE_IMAGE_URL}
            alt="Julgran"
            draggable="false"
            onError={() => setFailedTreeImage(true)}
          />
        )}

        {pendingPhoto && (
          <button
            type="button"
            className="christmas-tree-place-target"
            onClick={hangPhotoAt}
            aria-label="Välj plats för fotot på julgranen"
            disabled={isUploading}
          />
        )}

        {pendingPhoto && (
          <button
            type="button"
            className="christmas-tree-cancel"
            onClick={() => {
              setStatusMessage('')
              onPendingPhotoChange(null)
            }}
            disabled={isUploading}
            aria-label="Avbryt foto på julgranen"
          >
            ×
          </button>
        )}

        {[...ornaments, ...localOrnaments].map((ornament) => (
          <button
            type="button"
            className="christmas-tree-photo"
            key={ornament.id}
            style={{ left: `${ornament.x}%`, top: `${ornament.y}%` }}
            onClick={(mouseEvent) => {
              mouseEvent.stopPropagation()
              if (!pendingPhoto) setSelectedPhoto(ornament)
            }}
            aria-label="Visa foto på julgranen"
            title="Visa foto"
          >
            <img src={ornament.url} alt="" loading="lazy" />
          </button>
        ))}
      </div>

      {!pendingPhoto && (
        <p className="christmas-tree-sign">Ta bild och häng upp i granen</p>
      )}

      <span
        className="christmas-tree-live-region"
        role="status"
        aria-live="polite"
      >
        {statusMessage ||
          (isLoading ? 'Hämtar foton.' : '') ||
          (isUploading ? 'Hänger upp fotot.' : '')}
      </span>

      {errorMessage && (
        <>
          <p className="christmas-tree-error" role="alert">{errorMessage}</p>
          <button
            type="button"
            className="christmas-tree-cancel"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            Försök igen
          </button>
        </>
      )}

      {selectedPhoto && (
        <div
          className="christmas-tree-photo-backdrop"
          onMouseDown={(mouseEvent) => {
            if (mouseEvent.target === mouseEvent.currentTarget) {
              setSelectedPhoto(null)
            }
          }}
        >
          <div
            className="christmas-tree-photo-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Foto på julgranen"
          >
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              aria-label="Stäng fotot"
            >
              ×
            </button>
            <img src={selectedPhoto.url} alt="Foto upphängt på julgranen" />
          </div>
        </div>
      )}
      </aside>
    </>
  )
}
