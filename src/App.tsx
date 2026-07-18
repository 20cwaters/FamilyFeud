import { useCallback, useEffect, useState } from 'react'
import type { ClientGameState, QuestionBankPayload, Role } from '../shared/types'
import { getClientId, socket } from './socket'
import { HostView } from './views/HostView'
import { PlayerView } from './views/PlayerView'
import { TVView } from './views/TVView'

interface Session {
  code: string
  name: string
  role: Role
}

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem('ff-session')
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession)
  const [state, setState] = useState<ClientGameState | null>(null)
  const [bank, setBank] = useState<QuestionBankPayload | null>(null)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(socket.connected)

  const leave = useCallback(() => {
    sessionStorage.removeItem('ff-session')
    setSession(null)
    setState(null)
    setBank(null)
    socket.disconnect()
  }, [])

  useEffect(() => {
    const onState = (s: ClientGameState) => setState(s)
    const onBank = (b: QuestionBankPayload) => setBank(b)
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)
    socket.on('state', onState)
    socket.on('question_bank', onBank)
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    return () => {
      socket.off('state', onState)
      socket.off('question_bank', onBank)
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [])

  // (Re)join whenever we have a session and a fresh connection — covers page
  // refreshes and socket reconnects after server restarts or dropped wifi.
  useEffect(() => {
    if (!session) return
    const join = () => {
      socket.emit(
        'join_room',
        { clientId: getClientId(), code: session.code, name: session.name, role: session.role },
        (res: { ok: boolean; error?: string }) => {
          if (!res.ok) {
            setError(res.error ?? 'Could not join the room.')
            leave()
          }
        },
      )
    }
    socket.on('connect', join)
    if (socket.connected) join()
    else socket.connect()
    return () => {
      socket.off('connect', join)
    }
  }, [session, leave])

  const startSession = (s: Session) => {
    sessionStorage.setItem('ff-session', JSON.stringify(s))
    setError('')
    setSession(s)
  }

  if (!session) {
    return <JoinScreen error={error} onStart={startSession} />
  }

  if (!state) {
    return (
      <div className="flex min-h-full items-center justify-center text-slate-400">
        Connecting to room {session.code}…
      </div>
    )
  }

  return (
    <>
      {!connected && (
        <div className="fixed inset-x-0 top-0 z-[60] bg-red-600 py-1 text-center text-sm font-bold text-white">
          Reconnecting…
        </div>
      )}
      {state.you.role === 'host' && <HostView state={state} bank={bank} onLeave={leave} />}
      {state.you.role === 'tv' && <TVView state={state} />}
      {state.you.role === 'player' && <PlayerView state={state} onLeave={leave} />}
    </>
  )
}

/** Game-show oval badge, drawn in SVG so it scales crisply with no image assets. */
function FeudLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 440 260" className={className} role="img" aria-label="Family Feud">
      <defs>
        <linearGradient id="ffGold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="0.45" stopColor="#facc15" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id="ffBlue" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="0.5" stopColor="#1d4ed8" />
          <stop offset="1" stopColor="#172554" />
        </linearGradient>
        <linearGradient id="ffText" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fef9c3" />
          <stop offset="0.6" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
      </defs>

      {/* rays bursting out from behind the oval */}
      <g opacity="0.3" fill="#facc15">
        {Array.from({ length: 12 }, (_, i) => (
          <polygon key={i} points="212,-60 228,-60 220,130" transform={`rotate(${i * 30} 220 130)`} />
        ))}
      </g>

      {/* stacked ovals: shadow, gold rim, navy ring, blue face, top shine */}
      <ellipse cx="225" cy="139" rx="196" ry="104" fill="#060b18" opacity="0.85" />
      <ellipse cx="220" cy="130" rx="196" ry="104" fill="url(#ffGold)" />
      <ellipse cx="220" cy="130" rx="181" ry="91" fill="#172554" />
      <ellipse cx="220" cy="130" rx="174" ry="85" fill="url(#ffBlue)" />
      <ellipse cx="220" cy="88" rx="140" ry="38" fill="#ffffff" opacity="0.14" />

      <text
        x="220"
        y="120"
        textAnchor="middle"
        fontFamily="'Arial Black', 'Segoe UI', sans-serif"
        fontWeight="900"
        fontStyle="italic"
        fontSize="54"
        letterSpacing="3"
        fill="url(#ffText)"
        stroke="#78350f"
        strokeWidth="2.5"
        paintOrder="stroke"
      >
        FAMILY
      </text>
      <text
        x="220"
        y="196"
        textAnchor="middle"
        fontFamily="'Arial Black', 'Segoe UI', sans-serif"
        fontWeight="900"
        fontStyle="italic"
        fontSize="76"
        letterSpacing="6"
        fill="url(#ffText)"
        stroke="#78350f"
        strokeWidth="3"
        paintOrder="stroke"
      >
        FEUD
      </text>

      {/* sparkles */}
      <path d="M78 46 l7 16 16 7 -16 7 -7 16 -7 -16 -16 -7 16 -7 z" fill="#fef9c3" opacity="0.9" />
      <path d="M372 200 l5 11 11 5 -11 5 -5 11 -5 -11 -11 -5 11 -5 z" fill="#fef9c3" opacity="0.75" />
      <path d="M398 92 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4 z" fill="#fef9c3" opacity="0.6" />
    </svg>
  )
}

function JoinScreen({ error, onStart }: { error: string; onStart: (s: Session) => void }) {
  const [name, setName] = useState(localStorage.getItem('ff-name') ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const [tab, setTab] = useState<'join' | 'create'>('join')

  const createRoom = () => {
    if (!name.trim()) return setLocalError('Enter your name first.')
    setBusy(true)
    localStorage.setItem('ff-name', name.trim())
    socket.connect()
    socket.emit(
      'create_room',
      { clientId: getClientId(), name: name.trim() },
      (res: { ok: boolean; code?: string; error?: string }) => {
        setBusy(false)
        if (res.ok && res.code) onStart({ code: res.code, name: name.trim(), role: 'host' })
        else setLocalError(res.error ?? 'Could not create a room.')
      },
    )
  }

  const join = (role: Role) => {
    if (role !== 'tv' && !name.trim()) return setLocalError('Enter your name first.')
    if (code.trim().length < 4) return setLocalError('Enter the 4-letter room code.')
    localStorage.setItem('ff-name', name.trim())
    onStart({ code: code.trim().toUpperCase(), name: role === 'tv' ? name.trim() || 'TV' : name.trim(), role })
  }

  const message = localError || error

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-[#050b1f] p-6">
      {/* rotating sunburst, stage-light glows, and a vignette */}
      <div
        className="animate-sunburst pointer-events-none absolute left-1/2 top-1/2 h-[250vmax] w-[250vmax]"
        style={{
          background:
            'repeating-conic-gradient(from 0deg, rgba(250,204,21,0.09) 0deg 6deg, rgba(59,130,246,0.06) 6deg 12deg, transparent 12deg 24deg)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(37,99,235,0.35), transparent 55%), radial-gradient(ellipse at 50% 115%, rgba(30,58,138,0.5), transparent 60%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(2,6,23,0.92) 100%)' }}
      />
      <div className="pointer-events-none absolute left-[10%] top-[12%] h-44 w-44 animate-pulse rounded-full bg-yellow-400/10 blur-3xl" />
      <div className="pointer-events-none absolute right-[8%] top-[22%] h-56 w-56 animate-pulse rounded-full bg-sky-500/10 blur-3xl [animation-delay:1.2s]" />
      <div className="pointer-events-none absolute bottom-[8%] left-[18%] h-52 w-52 animate-pulse rounded-full bg-blue-600/10 blur-3xl [animation-delay:2.4s]" />

      <div className="relative w-full max-w-sm">
        <FeudLogo className="mx-auto w-72 max-w-full drop-shadow-[0_12px_35px_rgba(250,204,21,0.3)] md:w-80" />
        <p className="mt-3 text-center text-xs font-bold uppercase tracking-[0.4em] text-sky-300/80">
          Couch-party edition
        </p>
        <div className="mt-3 flex justify-center gap-2" aria-hidden>
          {[-6, 3, -2].map((tilt, i) => (
            <span
              key={i}
              style={{ transform: `rotate(${tilt}deg)` }}
              className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-red-500/60 bg-red-500/10 font-black text-red-500/80"
            >
              X
            </span>
          ))}
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-sky-400/20 bg-slate-950/70 shadow-[0_0_60px_rgba(30,64,175,0.35)] backdrop-blur">
          <div className="flex border-b border-slate-800">
            {(['join', 'create'] as const).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t)
                  setLocalError('')
                }}
                className={`flex-1 border-b-2 py-3 text-sm font-black uppercase tracking-wider ${
                  tab === t
                    ? 'border-yellow-400 bg-slate-900/70 text-yellow-400'
                    : 'border-transparent text-slate-500'
                }`}
              >
                {t === 'join' ? 'Join game' : 'Create game'}
              </button>
            ))}
          </div>

          <div className="space-y-3 p-5">
            {tab === 'join' ? (
              <>
                <p className="text-center text-xs text-slate-400">
                  Enter the 4-letter code from the TV or your host.
                </p>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="CODE"
                  maxLength={4}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-center text-2xl font-black uppercase tracking-[0.5em] outline-none focus:border-sky-400"
                />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  maxLength={20}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-lg outline-none focus:border-sky-400"
                />
                <button
                  onClick={() => join('player')}
                  className="w-full rounded-xl bg-gradient-to-b from-sky-400 to-blue-600 py-3 text-lg font-black uppercase text-white shadow-lg shadow-blue-950/50 active:scale-95"
                >
                  Join as player
                </button>
                <button
                  onClick={() => join('tv')}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 font-bold uppercase text-slate-300 active:scale-95"
                >
                  📺 This device is the TV
                </button>
                <button
                  onClick={() => join('host')}
                  className="w-full py-1 text-center text-xs font-semibold text-slate-500 underline active:scale-95"
                >
                  Rejoin as host
                </button>
              </>
            ) : (
              <>
                <p className="text-center text-xs text-slate-400">
                  You'll be the host — you run questions, reveals, strikes, and scores from this device.
                </p>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  maxLength={20}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-lg outline-none focus:border-sky-400"
                />
                <button
                  onClick={createRoom}
                  disabled={busy}
                  className="w-full rounded-xl bg-gradient-to-b from-yellow-300 to-amber-500 py-3 text-lg font-black uppercase tracking-wide text-blue-950 shadow-lg shadow-amber-900/40 active:scale-95 disabled:opacity-50"
                >
                  Create room
                </button>
              </>
            )}
          </div>
        </div>

        {message && <p className="mt-4 text-center font-semibold text-red-400">{message}</p>}
      </div>
    </div>
  )
}
