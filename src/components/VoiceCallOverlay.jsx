import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import ProfileAvatar from './ProfileAvatar.jsx'
import './VoiceCallOverlay.css'

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainder = (seconds % 60).toString().padStart(2, '0')
  return `${minutes}:${remainder}`
}

export default function VoiceCallOverlay({
  call,
  muted,
  onAnswer,
  onReject,
  onEnd,
  onToggleMute,
  onDismiss,
}) {
  const audioRef = useRef(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const isIncoming = call?.status === 'incoming'
  const isEnded = call?.status === 'ended'
  const isActive = call?.status === 'active'

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (audio.srcObject !== (call?.remoteStream || null)) {
      audio.srcObject = call?.remoteStream || null
    }

    if (call?.remoteStream) {
      audio.play().catch((error) => {
        console.warn('Samtalsljudet kunde inte starta automatiskt:', error)
      })
    }
  }, [call?.remoteStream])

  useEffect(() => {
    if (!isActive || !call?.connectedAt) {
      setElapsedSeconds(0)
      return undefined
    }

    const updateDuration = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - call.connectedAt) / 1000)))
    }

    updateDuration()
    const intervalId = window.setInterval(updateDuration, 1000)
    return () => window.clearInterval(intervalId)
  }, [call?.connectedAt, isActive])

  if (!call) return null

  const statusText = isIncoming
    ? 'Inkommande röstsamtal'
    : isActive
      ? formatDuration(elapsedSeconds)
      : isEnded
        ? call.statusMessage || 'Samtalet avslutades'
        : call.statusMessage || 'Ringer…'

  return (
    <div className="voice-call-backdrop">
      <section
        className={`voice-call-panel ${isEnded ? 'ended' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-call-name"
        aria-describedby="voice-call-status"
      >
        <audio ref={audioRef} autoPlay playsInline />
        <p className="voice-call-eyebrow">
          {isIncoming ? 'PLOT TWIST RÖSTSAMTAL' : 'RÖSTSAMTAL'}
        </p>
        <ProfileAvatar
          profile={call.remoteProfile}
          userId={call.remoteUserId}
          name={call.remoteName}
          size={112}
          className="voice-call-avatar"
        />
        <h2 id="voice-call-name">@{call.remoteName}</h2>
        <p id="voice-call-status" className={`voice-call-status ${isActive ? 'connected' : ''}`}>
          {statusText}
        </p>

        {isIncoming ? (
          <div className="voice-call-actions incoming-actions">
            <button type="button" className="voice-call-control decline" onClick={onReject}>
              <PhoneOff aria-hidden="true" />
              <span>Avvisa</span>
            </button>
            <button type="button" className="voice-call-control answer" onClick={onAnswer}>
              <Phone aria-hidden="true" />
              <span>Svara</span>
            </button>
          </div>
        ) : isEnded ? (
          <button type="button" className="voice-call-control dismiss" onClick={onDismiss}>
            Stäng
          </button>
        ) : (
          <div className="voice-call-actions">
            {(isActive || call.status === 'connecting') && (
              <button
                type="button"
                className={`voice-call-control mute ${muted ? 'is-muted' : ''}`}
                onClick={onToggleMute}
                aria-pressed={muted}
                aria-label={muted ? 'Slå på mikrofonen' : 'Stäng av mikrofonen'}
              >
                {muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
                <span>{muted ? 'Ljud av' : 'Ljud på'}</span>
              </button>
            )}
            <button type="button" className="voice-call-control decline" onClick={onEnd}>
              <PhoneOff aria-hidden="true" />
              <span>Avsluta</span>
            </button>
          </div>
        )}
      </section>
    </div>
  )
}