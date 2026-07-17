import { useEffect, useRef, useState } from 'react'
import type { BuzzResult, ClientGameState } from '../../shared/types'
import { Board } from '../components/Board'
import { ScoreBar, teamName } from '../components/ScoreBar'
import { StrikeOverlay } from '../components/StrikeOverlay'
import { socket } from '../socket'

export function PlayerView({ state, onLeave }: { state: ClientGameState; onLeave: () => void }) {
  const f = state.faceoff
  const inFaceoff = state.you.isFaceoffContestant && state.phase === 'faceoff'

  if (inFaceoff && f) {
    return <BuzzerScreen state={state} />
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col gap-3 p-4">
      <StrikeOverlay />
      <header className="flex items-center justify-between">
        <div>
          <span className="font-black text-white">{state.you.name}</span>
          <span className="ml-2 text-sm text-slate-400">
            {state.you.team ? teamName(state, state.you.team) : 'No team yet'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
            Room {state.code}
          </span>
          <button onClick={onLeave} className="text-xs text-slate-500 underline">
            leave
          </button>
        </div>
      </header>

      <ScoreBar state={state} />

      {state.phase === 'lobby' && (
        <div className="flex flex-1 flex-col items-center justify-center text-center text-slate-400">
          <div className="text-4xl">🎤</div>
          <p className="mt-3 font-semibold">
            {state.you.team
              ? 'Waiting for the host to start the round…'
              : 'Waiting for the host to put you on a team…'}
          </p>
        </div>
      )}

      {state.phase === 'fastmoney' && state.fastMoney && (
        <div className="flex-1 space-y-2">
          <div className="text-center text-xl font-black uppercase italic text-yellow-400">Fast Money</div>
          <div className="rounded-lg bg-blue-800 px-3 py-2 text-center font-bold leading-snug text-white">
            {state.fastMoney.currentIndex >= 0 ? (
              <>
                <span className="mr-2 text-yellow-300">Q{state.fastMoney.currentIndex + 1}/5</span>
                {state.fastMoney.questions[state.fastMoney.currentIndex].prompt}
              </>
            ) : (
              <span className="animate-pulse text-sky-300/80">Get ready…</span>
            )}
          </div>
          {state.fastMoney.questions.map((_q, qi) => (
            <div key={qi} className="flex items-center gap-2 text-sm">
              <span
                className={`w-5 text-center font-black ${
                  state.fastMoney!.currentIndex === qi ? 'text-yellow-400' : 'text-slate-600'
                }`}
              >
                {qi + 1}
              </span>
              {[0, 1].map((pass) => {
                const e = state.fastMoney!.entries[pass][qi]
                return (
                  <div key={pass} className="flex-1 truncate rounded bg-slate-800 px-2 py-1 font-bold text-white">
                    {e.revealed ? `${e.text} — ${e.points}` : '···'}
                  </div>
                )
              })}
            </div>
          ))}
          <div className="text-center text-2xl font-black text-yellow-300 tabular-nums">
            {state.fastMoney.revealedTotal} / 200
          </div>
        </div>
      )}

      {state.question && state.phase !== 'fastmoney' && (
        <div className="flex-1 space-y-3">
          <div className="rounded-lg bg-blue-800 px-3 py-2 text-center font-bold uppercase leading-snug text-white">
            {state.question.prompt ?? (
              <span className="animate-pulse text-sky-300/80">🤫 Listen for the question…</span>
            )}
          </div>
          <Board slots={state.question.slots} size="phone" />
          <div className="flex items-center justify-between text-sm">
            <StatusLine state={state} />
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className={`font-black ${i < state.strikes ? 'text-red-500' : 'text-slate-700'}`}>
                  ✕
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusLine({ state }: { state: ClientGameState }) {
  const f = state.faceoff
  if (state.phase === 'faceoff' && f) {
    if (f.buzzes.length > 0) return <span className="font-bold text-yellow-400">🔔 {f.buzzes[0].name} buzzed first</span>
    if (f.aName || f.bName)
      return (
        <span className="text-slate-400">
          Face-off: {f.aName ?? '?'} vs {f.bName ?? '?'}
        </span>
      )
    return <span className="text-slate-400">Face-off coming up…</span>
  }
  if (state.phase === 'board' && state.controllingTeam)
    return <span className="font-bold text-sky-400">{teamName(state, state.controllingTeam)} is playing</span>
  if (state.phase === 'steal') {
    const stealing = state.controllingTeam === 1 ? 2 : 1
    return <span className="font-bold text-red-400">Steal chance: {teamName(state, stealing as 1 | 2)}</span>
  }
  if (state.phase === 'round_end' && state.lastAward)
    return (
      <span className="font-bold text-yellow-400">
        +{state.lastAward.amount} to {teamName(state, state.lastAward.team)}
      </span>
    )
  return <span />
}

/** Full-screen buzzer mode for the two face-off contestants. */
function BuzzerScreen({ state }: { state: ClientGameState }) {
  const f = state.faceoff!
  const [myResult, setMyResult] = useState<BuzzResult | null>(null)
  const sentRef = useRef(false)

  // A re-arm clears the buzz list — reset local state so the buzzer goes live again.
  useEffect(() => {
    if (f.buzzes.length === 0) {
      setMyResult(null)
      sentRef.current = false
    }
  }, [f.buzzes.length, f.armed])

  const buzz = () => {
    if (sentRef.current || !state.you.buzzerLive) return
    sentRef.current = true
    socket.emit('buzz', (res: { result: BuzzResult }) => {
      setMyResult(res.result)
      if (res.result === 'won') navigator.vibrate?.([120, 40, 200])
      else navigator.vibrate?.(60)
    })
  }

  const winner = f.buzzes[0]
  const iWon = winner?.clientId === state.you.clientId || myResult === 'won'

  let body
  if (winner || myResult) {
    body = iWon ? (
      <div className="text-center">
        <div className="text-8xl">🔔</div>
        <div className="mt-4 text-4xl font-black uppercase text-green-400">You buzzed first!</div>
        <div className="mt-2 text-lg text-slate-300">Say your answer out loud!</div>
      </div>
    ) : (
      <div className="text-center">
        <div className="text-8xl">😩</div>
        <div className="mt-4 text-3xl font-black uppercase text-red-400">
          {winner ? `${winner.name} beat you to it` : 'Too late!'}
        </div>
      </div>
    )
  } else if (state.you.buzzerLive) {
    body = (
      <button
        onPointerDown={buzz}
        className="animate-buzz-pulse flex aspect-square w-[80vw] max-w-[420px] items-center justify-center rounded-full border-[10px] border-red-800 bg-gradient-to-b from-red-500 to-red-700 text-5xl font-black uppercase tracking-wide text-white shadow-[0_0_80px_rgba(239,68,68,0.6)] active:scale-95 active:from-red-600 active:to-red-800"
      >
        Buzz!
      </button>
    )
  } else {
    body = (
      <div className="text-center">
        <div className="text-7xl">🫸</div>
        <div className="mt-4 text-3xl font-black uppercase text-slate-300">Hands on the buzzer…</div>
        <div className="mt-2 text-slate-500">Wait for the host to arm it</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-gradient-to-b from-slate-950 to-red-950/40 p-6">
      <div className="mb-6 text-center">
        <div className="text-sm font-bold uppercase tracking-[0.3em] text-yellow-400">Face-off</div>
        <div className="mt-1 text-xl font-black text-white">
          {f.aName} vs {f.bName}
        </div>
        {state.question?.prompt ? (
          <div className="mt-3 max-w-sm rounded-lg bg-blue-900/60 px-4 py-2 font-semibold text-sky-200">
            {state.question.prompt}
          </div>
        ) : (
          <div className="mt-3 max-w-sm rounded-lg bg-blue-900/40 px-4 py-2 font-semibold text-sky-300/70">
            🤫 Listen for the question…
          </div>
        )}
      </div>
      {body}
    </div>
  )
}
