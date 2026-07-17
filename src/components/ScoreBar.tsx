import type { ClientGameState, TeamId } from '../../shared/types'

/** Compact two-team score strip used on player phones. */
export function ScoreBar({ state }: { state: ClientGameState }) {
  return (
    <div className="flex gap-2">
      {state.teams.map((team) => (
        <TeamScore
          key={team.id}
          name={team.name}
          score={team.score}
          highlighted={state.controllingTeam === team.id}
          mine={state.you.team === team.id}
        />
      ))}
    </div>
  )
}

function TeamScore({
  name,
  score,
  highlighted,
  mine,
}: {
  name: string
  score: number
  highlighted: boolean
  mine: boolean
}) {
  return (
    <div
      className={`flex flex-1 items-center justify-between rounded-lg border px-3 py-2 ${
        highlighted ? 'border-yellow-400 bg-yellow-400/10' : 'border-slate-700 bg-slate-900'
      }`}
    >
      <span className="truncate text-xs font-bold uppercase tracking-wider text-slate-300">
        {name}
        {mine && <span className="ml-1 text-yellow-400">★</span>}
      </span>
      <span className="ml-2 font-black tabular-nums text-white">{score}</span>
    </div>
  )
}

export function teamName(state: ClientGameState, team: TeamId | null): string {
  if (!team) return '—'
  return state.teams[team - 1].name
}
