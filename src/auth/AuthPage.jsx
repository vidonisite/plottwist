import { useState } from 'react'
import {
  ID,
  Permission,
  Role,
} from 'appwrite'
import {
  account,
  tablesDB,
  DATABASE_ID,
  USERS_TABLE_ID,
} from '../lib/appwrite.js'
import './AuthPage.css'

function normalizeUsername(value) {
  return value.trim().toLowerCase()
}

function getErrorMessage(error) {
  if (error?.code === 409) {
    return 'Det verkar redan finnas ett konto eller användarnamn. Kontrollera uppgifterna eller logga in.'
  }

  if (error?.code === 401 || error?.code === 403) {
    return 'Appwrite nekade åtkomsten. Kontrollera tabellens behörigheter i Appwrite Console.'
  }

  return error?.message || 'Något gick fel. Försök igen.'
}

export default function AuthPage({
  onAuthenticated,
  existingUser = null,
}) {
  const [mode, setMode] = useState(
    existingUser ? 'signup' : 'signup'
  )
  const [step, setStep] = useState(
    existingUser ? 'username' : 'email'
  )
  const [email, setEmail] = useState(existingUser?.email || '')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [resumingUser, setResumingUser] = useState(existingUser)

  const currentSetupUser = resumingUser || existingUser

  function switchMode(nextMode) {
    setMode(nextMode)
    setStep(nextMode === 'login' ? 'login' : 'email')
    setError('')
    setMessage('')
    setPassword('')
    setUsername('')
    setResumingUser(null)
  }

  function continueFromEmail(event) {
    event.preventDefault()
    setError('')
    setMessage('')

    if (!email.trim() || !email.includes('@')) {
      setError('Skriv en giltig mejladress.')
      return
    }

    setStep('password')
  }

  function continueFromPassword(event) {
    event.preventDefault()
    setError('')
    setMessage('')

    if (password.length < 8) {
      setError('Lösenordet måste innehålla minst 8 tecken.')
      return
    }

    setStep('username')
  }

  async function finishLogin(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      await account.createEmailPasswordSession({
        email: email.trim(),
        password,
      })

      const user = await account.get()
      const rowId = normalizeUsername(user.name)

      try {
        const profile = await tablesDB.getRow({
          databaseId: DATABASE_ID,
          tableId: USERS_TABLE_ID,
          rowId,
        })

        onAuthenticated({ user, profile })
      } catch (profileError) {
        if (profileError?.code !== 404) {
          throw profileError
        }

        // Kontot finns, men profilen har inte skapats ännu.
        setResumingUser(user)
        setUsername(user.name || '')
        setMode('signup')
        setStep('username')
        setPassword('')
        setMessage(
          'Kontot finns redan. Välj ett användarnamn för att slutföra profilen.'
        )
      }
    } catch (loginError) {
      setError(
        loginError?.code === 401
          ? 'Fel mejladress eller lösenord.'
          : getErrorMessage(loginError)
      )
    } finally {
      setLoading(false)
    }
  }

  async function finishSignup(event) {
    event.preventDefault()
    setError('')
    setMessage('')

    const normalized = normalizeUsername(username)

    if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
      setError(
        'Användarnamnet ska vara 3–20 tecken och bara innehålla a–z, siffror eller understreck.'
      )
      return
    }

    setLoading(true)

    try {
      // Kontrollera om användarnamnet redan används.
      // Radens ID är användarnamnet i gemener.
      try {
        const existingRow = await tablesDB.getRow({
          databaseId: DATABASE_ID,
          tableId: USERS_TABLE_ID,
          rowId: normalized,
        })

        const loggedInUser = await account.get().catch(() => null)

        // Om samma användare redan skapade raden men svaret
        // misslyckades på vägen kan vi slutföra inloggningen.
        if (
          loggedInUser &&
          existingRow.userId === loggedInUser.$id
        ) {
          onAuthenticated({
            user: loggedInUser,
            profile: existingRow,
          })
          return
        }

        setError('Det användarnamnet är redan upptaget. Prova ett annat.')
        return
      } catch (checkError) {
        if (checkError?.code !== 404) {
          throw new Error(
            'Vi kunde inte kontrollera om användarnamnet är ledigt. Kontrollera att tabellen tillåter läsning av användarnamn.'
          )
        }
      }

      // Om användaren redan är inloggad kan vi slutföra
      // en profil som saknas utan att skapa ett nytt konto.
      let user = await account.get().catch(() => null)

      if (!user) {
        if (!email.trim() || !password) {
          throw new Error(
            'Gå tillbaka och fyll i mejladress och lösenord igen.'
          )
        }

        await account.create({
          userId: ID.unique(),
          email: email.trim(),
          password,
          name: normalized,
        })

        await account.createEmailPasswordSession({
          email: email.trim(),
          password,
        })

        user = await account.get()
      } else if (user.name !== normalized) {
        await account.updateName({ name: normalized })
        user = await account.get()
      }

      // Skapa profilraden. Appwrite avvisar en rad om
      // samma rad-ID redan har skapats av någon annan.
      const profile = await tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: USERS_TABLE_ID,
        rowId: normalized,
        data: {
          userId: user.$id,
          username: normalized,
        },
        permissions: [
          Permission.read(Role.any()),
          Permission.update(Role.user(user.$id)),
          Permission.delete(Role.user(user.$id)),
        ],
      })

      onAuthenticated({ user, profile })
    } catch (signupError) {
      if (signupError?.code === 409) {
        setError(
          'Det användarnamnet hann bli upptaget. Prova ett annat.'
        )
      } else {
        setError(getErrorMessage(signupError))
      }
    } finally {
      setLoading(false)
    }
  }

  const isResuming = Boolean(currentSetupUser)

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <a className="auth-brand" href="#" onClick={(event) => event.preventDefault()}>
          <span className="auth-brand-mark">✳</span>
          <span>PLOT <em>TWIST</em></span>
        </a>

        <div className="auth-heading">
          <p className="auth-eyebrow">
            {mode === 'login' ? 'VÄLKOMMEN TILLBAKA' : 'DIN EGEN LILLA VÄRLD'}
          </p>

          <h1>
            {mode === 'login'
              ? <>Logga <span>in.</span></>
              : step === 'email'
                ? <>Börja <span>här.</span></>
                : step === 'password'
                  ? <>Håll det <span>hemligt.</span></>
                  : <>Välj ditt <span>namn.</span></>}
          </h1>

          <p className="auth-description">
            {mode === 'login'
              ? 'Logga in för att fortsätta där du slutade.'
              : step === 'email'
                ? 'Skapa ett konto och kliv in i PLOT TWIST.'
                : step === 'password'
                  ? 'Välj ett lösenord som bara du känner till.'
                  : 'Det här namnet kommer andra att känna igen dig med.'}
          </p>
        </div>

        {mode === 'signup' && !isResuming && (
          <div className="auth-progress" aria-label="Registreringssteg">
            {['email', 'password', 'username'].map((item, index) => (
              <div
                key={item}
                className={`auth-progress-step ${
                  step === item ? 'current' : ''
                } ${
                  ['email', 'password', 'username'].indexOf(step) > index
                    ? 'completed'
                    : ''
                }`}
              />
            ))}
          </div>
        )}

        {mode === 'login' ? (
          <form className="auth-form" onSubmit={finishLogin}>
            <label htmlFor="login-email">Mejladress</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="du@exempel.se"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />

            <label htmlFor="login-password">Lösenord</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="Ditt lösenord"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            {error && <p className="auth-error" role="alert">{error}</p>}

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'Loggar in…' : 'Logga in'}
              <span aria-hidden="true">↗</span>
            </button>
          </form>
        ) : (
          <>
            {step === 'email' && (
              <form className="auth-form" onSubmit={continueFromEmail}>
                <label htmlFor="signup-email">Mejladress</label>
                <input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  placeholder="du@exempel.se"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />

                {error && <p className="auth-error" role="alert">{error}</p>}

                <button className="auth-submit" type="submit">
                  Fortsätt <span aria-hidden="true">↗</span>
                </button>
              </form>
            )}

            {step === 'password' && (
              <form className="auth-form" onSubmit={continueFromPassword}>
                <label htmlFor="signup-password">Lösenord</label>
                <input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Minst 8 tecken"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  required
                />

                <p className="auth-hint">
                  Använd ett unikt lösenord som du inte använder på andra webbplatser.
                </p>

                {error && <p className="auth-error" role="alert">{error}</p>}

                <button className="auth-submit" type="submit">
                  Fortsätt <span aria-hidden="true">↗</span>
                </button>
              </form>
            )}

            {step === 'username' && (
              <form className="auth-form" onSubmit={finishSignup}>
                {isResuming && (
                  <p className="auth-hint">
                    Inloggad som {currentSetupUser.email}. Slutför din profil genom att välja ett användarnamn.
                  </p>
                )}

                <label htmlFor="signup-username">Användarnamn</label>
                <div className="username-input-wrap">
                  <span>@</span>
                  <input
                    id="signup-username"
                    type="text"
                    autoComplete="username"
                    placeholder="dittnamn"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    minLength={3}
                    maxLength={20}
                    pattern="[A-Za-z0-9_]{3,20}"
                    required
                  />
                </div>

                <p className="auth-hint">
                  3–20 tecken. Bokstäver, siffror och understreck. Vi kontrollerar om namnet är ledigt när du fortsätter.
                </p>

                {error && <p className="auth-error" role="alert">{error}</p>}

                <button className="auth-submit" type="submit" disabled={loading}>
                  {loading ? 'Kontrollerar…' : 'Skapa konto'}
                  {!loading && <span aria-hidden="true">↗</span>}
                </button>
              </form>
            )}
          </>
        )}

        {message && <p className="auth-message">{message}</p>}

        {mode === 'signup' && step !== 'email' && !isResuming && (
          <button
            className="auth-back"
            type="button"
            onClick={() => {
              setError('')
              setMessage('')
              setStep(step === 'username' ? 'password' : 'email')
            }}
          >
            ← Tillbaka
          </button>
        )}

        {!isResuming && (
          <p className="auth-switch">
            {mode === 'login' ? 'Har du inget konto?' : 'Har du redan ett konto?'}{' '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
            >
              {mode === 'login' ? 'Skapa konto' : 'Logga in'}
            </button>
          </p>
        )}

        <p className="auth-footnote">
          Inget verifieringsmejl i registreringsflödet.
        </p>
      </section>
    </main>
  )
}