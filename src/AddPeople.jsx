import { useEffect, useState } from 'react'
import { ID, Permission, Role, Query } from 'appwrite'
import {
  account,
  tablesDB,
  DATABASE_ID,
  USERS_TABLE_ID,
  CONTACTS_TABLE_ID,
  CONVERSATIONS_TABLE_ID,
  CONVERSATION_MEMBERS_TABLE_ID,
} from './lib/appwrite.js'
import './AddPeople.css'

// Skapar ett stabilt ID som är högst 32 tecken långt.
// Samma indata ger alltid samma ID.
async function stableId(value) {
  const bytes = new TextEncoder().encode(value)
  const hash = await crypto.subtle.digest('SHA-256', bytes)

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

export default function AddPeople() {
  const [currentUser, setCurrentUser] = useState(null)
  const [users, setUsers] = useState([])
  const [contacts, setContacts] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [addingId, setAddingId] = useState(null)
  const [respondingId, setRespondingId] = useState(null)
  const [message, setMessage] = useState('')

  // Ladda inloggad användare, profiler och kontaktförfrågningar.
  useEffect(() => {
    let cancelled = false

    async function initialize() {
      setLoading(true)
      setMessage('')

      try {
        const user = await account.get()

        if (cancelled) return
        setCurrentUser(user)

        let userRows
        let contactRows

        try {
          const response = await tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: USERS_TABLE_ID,
            queries: [
              Query.orderAsc('username'),
              Query.limit(100),
            ],
          })

          userRows = response.rows
        } catch (error) {
          throw new Error(
            `Kunde inte ladda profiler (Appwrite ${error.code ?? '?'}): ${error.message}`
          )
        }

        try {
          const response = await tablesDB.listRows({
            databaseId: DATABASE_ID,
            tableId: CONTACTS_TABLE_ID,
            queries: [Query.limit(500)],
          })

          contactRows = response.rows
        } catch (error) {
          throw new Error(
            `Kunde inte ladda kontakter (Appwrite ${error.code ?? '?'}): ${error.message}`
          )
        }

        if (cancelled) return

        setUsers(
          userRows.filter(
            (profile) => profile.userId !== user.$id
          )
        )

        setContacts(contactRows)
      } catch (error) {
        console.error('Kunde inte ladda Lägg till personer:', error)

        if (!cancelled) {
          setMessage(error.message || 'Ett okänt fel inträffade.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    initialize()

    return () => {
      cancelled = true
    }
  }, [])

  const filteredUsers = users.filter((user) =>
    (user.username || '')
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  )

  const myContacts = contacts.filter(
    (contact) => contact.ownerId === currentUser?.$id
  )

  const incomingRequests = contacts.filter(
    (contact) =>
      contact.contactUserId === currentUser?.$id &&
      contact.status === 'pending'
  )

  function isContact(userId) {
    return myContacts.some(
      (contact) =>
        contact.contactUserId === userId &&
        contact.status === 'accepted'
    )
  }

  function hasOutgoingRequest(userId) {
    return myContacts.some(
      (contact) =>
        contact.contactUserId === userId &&
        contact.status === 'pending'
    )
  }

  // Skapa eller återanvänd en privat chatt mellan två användare.
  async function ensureDirectConversation(userAId, userBId) {
    if (!userAId || !userBId || userAId === userBId) {
      throw new Error('Ogiltiga användare för chatten.')
    }

    // Sorteringen gör att ordningen på användarna inte spelar roll.
    const directKey = [userAId, userBId].sort().join(':')
    const conversationId = await stableId(`direct:${directKey}`)

    let conversation

    try {
      // Försök hitta chatten via dess stabila ID.
      conversation = await tablesDB.getRow({
        databaseId: DATABASE_ID,
        tableId: CONVERSATIONS_TABLE_ID,
        rowId: conversationId,
      })

      if (conversation.directKey !== directKey) {
        throw new Error(
          'Chattens ID matchar inte användarna. Kontakta administratören.'
        )
      }
    } catch (error) {
      if (error.message?.includes('matchar inte användarna')) {
        throw error
      }

      if (error.code !== 404) {
        throw error
      }

      // Skapa chatten med ett deterministiskt ID.
      try {
        conversation = await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: CONVERSATIONS_TABLE_ID,
          rowId: conversationId,
          data: {
            type: 'direct',
            name: 'Privat chatt',
            createdBy: userAId,
            directKey,
          },
          permissions: [
            Permission.read(Role.users()),
            Permission.update(Role.users()),
            Permission.delete(Role.users()),
          ],
        })
      } catch (createError) {
        // Om ett parallellt försök redan skapade chatten,
        // hämta den i stället för att skapa en till.
        try {
          conversation = await tablesDB.getRow({
            databaseId: DATABASE_ID,
            tableId: CONVERSATIONS_TABLE_ID,
            rowId: conversationId,
          })
        } catch {
          throw createError
        }
      }
    }

    // Lägg till båda medlemmarna. Deras rad-ID:n är också stabila.
    for (const userId of [userAId, userBId]) {
      const memberId = await stableId(
        `member:${conversation.$id}:${userId}`
      )

      try {
        await tablesDB.getRow({
          databaseId: DATABASE_ID,
          tableId: CONVERSATION_MEMBERS_TABLE_ID,
          rowId: memberId,
        })
      } catch (error) {
        if (error.code !== 404) throw error

        try {
          await tablesDB.createRow({
            databaseId: DATABASE_ID,
            tableId: CONVERSATION_MEMBERS_TABLE_ID,
            rowId: memberId,
            data: {
              userId,
              conversationId: conversation.$id,
            },
            permissions: [
              Permission.read(Role.users()),
            ],
          })
        } catch (createError) {
          // Om raden skapades parallellt, kontrollera att den finns.
          try {
            await tablesDB.getRow({
              databaseId: DATABASE_ID,
              tableId: CONVERSATION_MEMBERS_TABLE_ID,
              rowId: memberId,
            })
          } catch {
            throw createError
          }
        }
      }
    }

    return conversation
  }

  async function addContact(profile) {
    if (
      !currentUser ||
      isContact(profile.userId) ||
      hasOutgoingRequest(profile.userId)
    ) {
      return
    }

    setAddingId(profile.userId)
    setMessage('')

    try {
      const request = await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: CONTACTS_TABLE_ID,
        rowId: ID.unique(),
        data: {
          ownerId: currentUser.$id,
          contactUserId: profile.userId,
          contactUsername: profile.username,
          status: 'pending',
        },
        permissions: [
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users()),
        ],
      })

      setContacts((previous) => [...previous, request])
      setMessage(`Förfrågan skickad till @${profile.username}!`)
    } catch (error) {
      console.error('Kunde inte skicka förfrågan:', error)
      setMessage(
        `Kunde inte skicka förfrågan (Appwrite ${error.code ?? '?'}): ${error.message}`
      )
    } finally {
      setAddingId(null)
    }
  }

  async function respondToRequest(request, accept) {
    if (!currentUser) return

    setRespondingId(request.$id)
    setMessage('')

    try {
      if (accept) {
        const sender = users.find(
          (profile) => profile.userId === request.ownerId
        )

        if (!sender) {
          throw new Error('Kunde inte hitta avsändarens profil.')
        }

        // 1. Skapa eller återanvänd den privata chatten.
        const conversation = await ensureDirectConversation(
          currentUser.$id,
          request.ownerId
        )

        // 2. Hitta mottagarens kontaktpost om den redan finns.
        const existingResult = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: CONTACTS_TABLE_ID,
          queries: [
            Query.equal('ownerId', [currentUser.$id]),
            Query.equal('contactUserId', [request.ownerId]),
            Query.equal('status', ['accepted']),
            Query.limit(1),
          ],
        })

        let acceptedContact = existingResult.rows[0] ?? null

        // 3. Skapa kontaktposten endast om den saknas.
        if (!acceptedContact) {
          acceptedContact = await tablesDB.createRow({
            databaseId: DATABASE_ID,
            tableId: CONTACTS_TABLE_ID,
            rowId: ID.unique(),
            data: {
              ownerId: currentUser.$id,
              contactUserId: request.ownerId,
              contactUsername: sender.username,
              status: 'accepted',
            },
            permissions: [
              Permission.read(Role.user(currentUser.$id)),
              Permission.update(Role.user(currentUser.$id)),
              Permission.delete(Role.user(currentUser.$id)),
            ],
          })
        }

        // 4. Markera den ursprungliga förfrågan som accepterad.
        if (request.status !== 'accepted') {
          await tablesDB.updateRow({
            databaseId: DATABASE_ID,
            tableId: CONTACTS_TABLE_ID,
            rowId: request.$id,
            data: { status: 'accepted' },
          })
        }

        setContacts((previous) => {
          const withoutRequest = previous.filter(
            (item) => item.$id !== request.$id
          )

          if (
            withoutRequest.some(
              (item) => item.$id === acceptedContact.$id
            )
          ) {
            return withoutRequest
          }

          return [...withoutRequest, acceptedContact]
        })

        setMessage(
          `Du och @${sender.username} är nu kontakter! En privat chatt har skapats.`
        )

        console.log('Privat chatt skapad eller återanvänd:', conversation.$id)
      } else {
        await tablesDB.deleteRow({
          databaseId: DATABASE_ID,
          tableId: CONTACTS_TABLE_ID,
          rowId: request.$id,
        })

        setContacts((previous) =>
          previous.filter((item) => item.$id !== request.$id)
        )

        setMessage('Förfrågan har avvisats.')
      }
    } catch (error) {
      console.error('Kunde inte hantera förfrågan:', error)
      setMessage(
        `Kunde inte hantera förfrågan (Appwrite ${error.code ?? '?'}): ${error.message}`
      )
    } finally {
      setRespondingId(null)
    }
  }

  if (loading) {
    return (
      <section className="people-page">
        <p className="people-muted">Laddar användare...</p>
      </section>
    )
  }

  return (
    <section className="people-page">
      <header className="people-header">
        <div>
          <p className="people-eyebrow">PLOT TWIST</p>
          <h1>Lägg till personer</h1>
          <p className="people-muted">
            Upptäck andra användare och hitta dina vänner.
          </p>
        </div>

        <div className="people-count">
          {users.length}
          <span>användare</span>
        </div>
      </header>

      {message && (
        <p className="people-message" role="status">
          {message}
        </p>
      )}

      {incomingRequests.length > 0 && (
        <section className="incoming-requests">
          <div className="people-list-heading">
            <h2>Vänförfrågningar</h2>
            <span>{incomingRequests.length}</span>
          </div>

          {incomingRequests.map((request) => {
            const sender = users.find(
              (profile) => profile.userId === request.ownerId
            )

            return (
              <div className="people-contact" key={request.$id}>
                <div className="people-avatar">
                  {(sender?.username || '?').slice(0, 1).toUpperCase()}
                </div>

                <div className="people-user-info">
                  <strong>
                    @{sender?.username || request.contactUsername || 'Okänd användare'}
                  </strong>
                  <span>Vill lägga till dig</span>
                </div>

                <button
                  type="button"
                  className="request-accept"
                  disabled={respondingId === request.$id}
                  onClick={() => respondToRequest(request, true)}
                >
                  {respondingId === request.$id ? 'Vänta...' : 'Acceptera'}
                </button>

                <button
                  type="button"
                  className="request-decline"
                  disabled={respondingId === request.$id}
                  onClick={() => respondToRequest(request, false)}
                >
                  Avvisa
                </button>
              </div>
            )
          })}
        </section>
      )}

      <label className="people-search">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Sök bland alla användare..."
          autoComplete="off"
        />

        {search && (
          <button
            type="button"
            className="people-clear"
            onClick={() => setSearch('')}
            aria-label="Rensa sökning"
          >
            ×
          </button>
        )}
      </label>

      <div className="people-list-heading">
        <h2>{search ? 'Sökresultat' : 'Alla användare'}</h2>
        <span>{filteredUsers.length}</span>
      </div>

      {filteredUsers.length === 0 ? (
        <div className="people-empty">
          <div className="people-empty-icon">⌕</div>
          <h3>Inga användare hittades</h3>
          <p>
            {search
              ? 'Testa att söka på ett annat användarnamn.'
              : 'Det finns inga andra användare att visa ännu.'}
          </p>
        </div>
      ) : (
        <div className="people-list">
          {filteredUsers.map((profile) => {
            const added = isContact(profile.userId)
            const pending = hasOutgoingRequest(profile.userId)
            const adding = addingId === profile.userId

            return (
              <div className="people-contact" key={profile.$id}>
                <div className="people-avatar">
                  {(profile.username || '?').slice(0, 1).toUpperCase()}
                </div>

                <div className="people-user-info">
                  <strong>@{profile.username}</strong>
                  <span>
                    {added
                      ? 'Redan kontakt'
                      : pending
                        ? 'Förfrågan skickad'
                        : 'PLOT TWIST-användare'}
                  </span>
                </div>

                <button
                  type="button"
                  className={`people-add-button ${added || pending ? 'is-added' : ''}`}
                  onClick={() => addContact(profile)}
                  disabled={added || pending || adding}
                >
                  {added
                    ? 'Tillagd ✓'
                    : pending
                      ? 'Skickad ✓'
                      : adding
                        ? 'Skickar...'
                        : <><span>+</span> Lägg till</>}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}