import { beforeEach, describe, expect, it } from 'vitest'
import { Game } from './game'
import type { FxEvent, QuestionData } from '../shared/types'

const testBank: QuestionData[] = [
  {
    id: 'tq1',
    prompt: 'Test question one',
    category: 'Test',
    answers: [
      { text: 'Alpha', points: 40 },
      { text: 'Bravo', points: 30 },
      { text: 'Charlie', points: 20 },
      { text: 'Delta', points: 10 },
    ],
  },
  {
    id: 'tq2',
    prompt: 'Test question two',
    category: 'Test',
    answers: [
      { text: 'Echo', points: 60 },
      { text: 'Foxtrot', points: 40 },
    ],
  },
]

const testFmBank: QuestionData[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((letter, i) => ({
  id: `tfm${i}`,
  prompt: `FM question ${letter}`,
  category: 'Fast Money',
  answers: [
    { text: `${letter}-top`, points: 50 },
    { text: `${letter}-second`, points: 25 },
  ],
}))

function makeGame(): Game {
  const g = new Game('TEST', testBank, testFmBank)
  g.addMember('host1', 'Casey', 'host')
  g.addMember('tv1', 'TV', 'tv')
  g.addMember('p1', 'Ana', 'player')
  g.addMember('p2', 'Ben', 'player')
  g.addMember('p3', 'Cam', 'player')
  g.addMember('p4', 'Dee', 'player')
  g.assignTeam('p1', 1)
  g.assignTeam('p2', 1)
  g.assignTeam('p3', 2)
  g.assignTeam('p4', 2)
  return g
}

/** Game set up mid-face-off with p1 vs p3 armed. */
function makeFaceoffGame(): Game {
  const g = makeGame()
  g.selectQuestion('tq1')
  g.setFaceoffPair('p1', 'p3')
  g.armBuzzers()
  return g
}

describe('buzzer', () => {
  let g: Game
  beforeEach(() => {
    g = makeFaceoffGame()
  })

  it('awards the win to the earliest server timestamp and marks later buzzes late', () => {
    expect(g.buzz('p1', 1000)).toBe('won')
    expect(g.buzz('p3', 1005)).toBe('late')
    const state = g.toStateFor('tv1')!
    expect(state.faceoff?.winnerId).toBe('p1')
    expect(state.faceoff?.buzzes).toHaveLength(2)
  })

  it('ignores buzzes when buzzers are not armed', () => {
    g.resetBuzzers()
    expect(g.buzz('p1', 1000)).toBe('inactive')
  })

  it('ignores buzzes outside the faceoff phase', () => {
    g.setControl(1)
    expect(g.buzz('p1', 1000)).toBe('inactive')
  })

  it('rejects buzzes from non-contestants', () => {
    expect(g.buzz('p2', 999)).toBe('not_contestant')
    expect(g.toStateFor('tv1')!.faceoff?.winnerId).toBeNull()
  })

  it('rejects duplicate buzzes from the same player', () => {
    expect(g.buzz('p1', 1000)).toBe('won')
    expect(g.buzz('p1', 1001)).toBe('duplicate')
  })

  it('re-arming clears previous buzzes', () => {
    g.buzz('p1', 1000)
    g.armBuzzers()
    const state = g.toStateFor('tv1')!
    expect(state.faceoff?.buzzes).toHaveLength(0)
    expect(state.faceoff?.winnerId).toBeNull()
    expect(g.buzz('p3', 2000)).toBe('won')
  })

  it('only live contestants get buzzerLive, and only until someone buzzes', () => {
    expect(g.toStateFor('p1')!.you.buzzerLive).toBe(true)
    expect(g.toStateFor('p3')!.you.buzzerLive).toBe(true)
    expect(g.toStateFor('p2')!.you.buzzerLive).toBe(false)
    g.buzz('p3', 1000)
    expect(g.toStateFor('p1')!.you.buzzerLive).toBe(false)
    expect(g.toStateFor('p3')!.you.buzzerLive).toBe(false)
  })
})

describe('reveals and the pot', () => {
  it('adds points to the pot once per answer', () => {
    const g = makeFaceoffGame()
    g.setControl(1)
    expect(g.reveal(0)).toBe(true)
    expect(g.reveal(0)).toBe(false) // already revealed
    expect(g.pot).toBe(40)
    g.reveal(1)
    expect(g.pot).toBe(70)
  })

  it('counts reveals during faceoff and steal toward the pot', () => {
    const g = makeFaceoffGame()
    g.reveal(1) // face-off guess
    expect(g.pot).toBe(30)
    g.setControl(2)
    g.strike()
    g.strike()
    g.strike()
    expect(g.phase).toBe('steal')
    g.reveal(0) // successful steal guess
    expect(g.pot).toBe(70)
  })

  it('does not grow the pot when revealing leftovers after the round ends', () => {
    const g = makeFaceoffGame()
    g.setControl(1)
    g.reveal(0)
    g.awardPot(1)
    expect(g.phase).toBe('round_end')
    g.reveal(1) // flip the rest for the reveal-through
    expect(g.pot).toBe(0)
    expect(g.toStateFor('tv1')!.question?.slots[1].revealed).toBe(true)
  })

  it('hides unrevealed answers from players and the TV but not the host', () => {
    const g = makeFaceoffGame()
    g.reveal(0)
    const playerSlots = g.toStateFor('p1')!.question!.slots
    expect(playerSlots[0]).toMatchObject({ revealed: true, text: 'Alpha', points: 40 })
    expect(playerSlots[1]).toMatchObject({ revealed: false, text: null, points: null })
    const hostSlots = g.toStateFor('host1')!.question!.slots
    expect(hostSlots[1]).toMatchObject({ revealed: false, text: 'Bravo', points: 30 })
  })
})

describe('strikes and stealing', () => {
  let g: Game
  beforeEach(() => {
    g = makeFaceoffGame()
    g.setControl(1)
  })

  it('flips to steal on the third strike and caps at three', () => {
    g.strike()
    g.strike()
    expect(g.phase).toBe('board')
    g.strike()
    expect(g.strikes).toBe(3)
    expect(g.phase).toBe('steal')
    g.strike()
    expect(g.strikes).toBe(3)
  })

  it('does not accumulate strikes during the faceoff', () => {
    const g2 = makeFaceoffGame()
    g2.strike()
    expect(g2.strikes).toBe(0)
  })

  it('emits a strike fx with the running count', () => {
    const fxs: FxEvent[] = []
    g.onFx = (fx) => fxs.push(fx)
    g.strike()
    g.strike()
    expect(fxs).toEqual([
      { type: 'strike', strikes: 1 },
      { type: 'strike', strikes: 2 },
    ])
  })

  it('removeStrike undoes an accidental third strike and returns to board', () => {
    g.strike()
    g.strike()
    g.strike()
    expect(g.phase).toBe('steal')
    g.removeStrike()
    expect(g.strikes).toBe(2)
    expect(g.phase).toBe('board')
  })

  it('a failed steal leaves the pot for the original team to be awarded', () => {
    g.reveal(0)
    g.reveal(1)
    g.strike()
    g.strike()
    g.strike()
    expect(g.phase).toBe('steal')
    // Host marks the steal guess wrong (fx only), then awards the original team.
    g.strike()
    expect(g.strikes).toBe(3) // steal misses don't add a fourth strike
    g.awardPot(1)
    expect(g.teams[0].score).toBe(70)
    expect(g.teams[1].score).toBe(0)
  })
})

describe('scoring and rounds', () => {
  it('awards pot times multiplier and resets it', () => {
    const g = makeFaceoffGame()
    g.setControl(2)
    g.setMultiplier(2)
    g.reveal(0)
    g.reveal(2)
    expect(g.toStateFor('tv1')!.bank).toBe(120) // (40 + 20) x2
    g.awardPot(2)
    expect(g.teams[1].score).toBe(120)
    expect(g.pot).toBe(0)
    expect(g.lastAward).toEqual({ team: 2, amount: 120 })
    expect(g.phase).toBe('round_end')
  })

  it('does not double-award after round end', () => {
    const g = makeFaceoffGame()
    g.setControl(1)
    g.reveal(0)
    g.awardPot(1)
    g.awardPot(1)
    expect(g.teams[0].score).toBe(40)
  })

  it('manual score adjustments apply and never go negative', () => {
    const g = makeGame()
    g.adjustScore(1, 25)
    expect(g.teams[0].score).toBe(25)
    g.adjustScore(1, -100)
    expect(g.teams[0].score).toBe(0)
  })

  it('nextRound resets board state but keeps scores', () => {
    const g = makeFaceoffGame()
    g.setControl(1)
    g.reveal(0)
    g.awardPot(1)
    g.nextRound()
    expect(g.round).toBe(2)
    expect(g.phase).toBe('lobby')
    expect(g.question).toBeNull()
    expect(g.strikes).toBe(0)
    expect(g.pot).toBe(0)
    expect(g.controllingTeam).toBeNull()
    expect(g.teams[0].score).toBe(40)
  })

  it('selecting a question resets the board and marks it used', () => {
    const g = makeGame()
    g.selectQuestion('tq1')
    expect(g.phase).toBe('faceoff')
    expect(g.usedQuestionIds.has('tq1')).toBe(true)
    expect(g.toStateFor('p1')!.question?.slots).toHaveLength(4)
    expect(g.toStateFor('p1')!.question?.slots.every((s) => !s.revealed)).toBe(true)
  })

  it('hides the question prompt from players and the TV until the host shows it', () => {
    const g = makeGame()
    g.selectQuestion('tq1')
    expect(g.toStateFor('p1')!.question?.prompt).toBeNull()
    expect(g.toStateFor('tv1')!.question?.prompt).toBeNull()
    expect(g.toStateFor('host1')!.question?.prompt).toBe('Test question one')
    expect(g.toStateFor('tv1')!.questionVisible).toBe(false)
    g.showQuestion()
    expect(g.toStateFor('p1')!.question?.prompt).toBe('Test question one')
    expect(g.toStateFor('tv1')!.questionVisible).toBe(true)
  })

  it('a newly selected question starts hidden again', () => {
    const g = makeGame()
    g.selectQuestion('tq1')
    g.showQuestion()
    g.setControl(1)
    g.awardPot(1)
    g.nextRound()
    g.selectQuestion('tq2')
    expect(g.toStateFor('p1')!.question?.prompt).toBeNull()
  })

  it('canceling a question makes it pickable again', () => {
    const g = makeGame()
    g.selectQuestion('tq1')
    g.cancelQuestion()
    expect(g.phase).toBe('lobby')
    expect(g.usedQuestionIds.has('tq1')).toBe(false)
  })
})

describe('membership', () => {
  it('rejects a second host while one is connected, allows takeover after disconnect', () => {
    const g = makeGame()
    expect(g.addMember('host2', 'Rival', 'host')).toMatchObject({ ok: false })
    g.markDisconnected('host1')
    expect(g.addMember('host2', 'Rival', 'host')).toEqual({ ok: true })
    expect(g.hostId).toBe('host2')
    expect(g.members.get('host1')?.role).toBe('player')
  })

  it('rejoining with the same clientId reconnects instead of duplicating', () => {
    const g = makeGame()
    g.markDisconnected('p1')
    g.addMember('p1', 'Ana', 'player')
    const players = g.toStateFor('host1')!.members.filter((m) => m.name === 'Ana')
    expect(players).toHaveLength(1)
    expect(players[0].connected).toBe(true)
    expect(players[0].team).toBe(1) // team survives the reconnect
  })

  it('only players can be assigned to teams', () => {
    const g = makeGame()
    g.assignTeam('tv1', 1)
    expect(g.members.get('tv1')?.team).toBeNull()
  })
})

describe('fast money', () => {
  it('runs a full fast money pass with scoring and redaction', () => {
    const g = makeGame()
    g.startFastMoney()
    expect(g.phase).toBe('fastmoney')
    expect(g.fastMoney?.questions).toHaveLength(5)

    g.fmSetAnswer(0, 0, 0) // top answer: 50
    g.fmSetAnswer(0, 1, -1) // no match: 0
    g.fmSetAnswer(1, 0, 1) // second answer: 25

    // Nothing revealed yet: totals stay at zero and the TV sees nothing.
    expect(g.fmTotal()).toBe(0)
    const tvBefore = g.toStateFor('tv1')!.fastMoney!
    expect(tvBefore.entries[0][0].text).toBeNull()
    expect(tvBefore.questions[0].answers).toBeUndefined()

    g.fmReveal(0, 0)
    g.fmReveal(0, 1)
    g.fmReveal(1, 0)
    expect(g.fmTotal()).toBe(75)

    const tvAfter = g.toStateFor('tv1')!.fastMoney!
    expect(tvAfter.entries[0][0]).toMatchObject({ revealed: true, points: 50 })
    expect(tvAfter.revealedTotal).toBe(75)
    // Host sees everything including bank answers.
    expect(g.toStateFor('host1')!.fastMoney!.questions[0].answers).toBeDefined()

    g.endFastMoney()
    expect(g.phase).toBe('lobby')
    expect(g.fastMoney).toBeNull()
  })

  it('shows prompts to players/TV one at a time as the host advances', () => {
    const g = makeGame()
    g.startFastMoney()
    let tv = g.toStateFor('tv1')!.fastMoney!
    expect(tv.currentIndex).toBe(-1)
    expect(tv.questions.every((q) => q.prompt === '')).toBe(true)

    g.fmSetCurrent(0)
    tv = g.toStateFor('tv1')!.fastMoney!
    expect(tv.questions[0].prompt).not.toBe('')
    expect(tv.questions.slice(1).every((q) => q.prompt === '')).toBe(true)

    g.fmSetCurrent(1)
    tv = g.toStateFor('tv1')!.fastMoney!
    expect(tv.questions[0].prompt).toBe('') // previous one goes back down
    expect(tv.questions[1].prompt).not.toBe('')

    // The host always sees every prompt.
    expect(g.toStateFor('host1')!.fastMoney!.questions.every((q) => q.prompt !== '')).toBe(true)

    // Switching to the second pass starts with no question up again.
    g.fmSetActivePass(1)
    expect(g.toStateFor('tv1')!.fastMoney!.currentIndex).toBe(-1)

    // Out-of-range indexes are ignored.
    g.fmSetCurrent(99)
    expect(g.toStateFor('tv1')!.fastMoney!.currentIndex).toBe(-1)
  })

  it('cannot reveal an entry before an answer is set', () => {
    const g = makeGame()
    g.startFastMoney()
    g.fmReveal(0, 0)
    expect(g.fmTotal()).toBe(0)
    expect(g.toStateFor('tv1')!.fastMoney!.entries[0][0].revealed).toBe(false)
  })
})
