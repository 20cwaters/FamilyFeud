import express from 'express'
import { createServer } from 'http'
import { Server, type Socket } from 'socket.io'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { Game } from './game'
import { fastMoneyBank, questionBank } from './questions'
import type { JoinPayload, QuestionBankPayload, TeamId } from '../shared/types'

interface SocketData {
  code?: string
  clientId?: string
}

// Events are validated at runtime (host checks, payload guards); keep the maps loose.
interface EventsMap {
  [event: string]: (...args: any[]) => void
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 3210

const app = express()
const httpServer = createServer(app)
const io = new Server<EventsMap, EventsMap, EventsMap, SocketData>(httpServer)

type GameSocket = Socket<EventsMap, EventsMap, EventsMap, SocketData>

const rooms = new Map<string, Game>()

// No I/O/0/1 lookalikes — codes get read off a TV screen.
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
function generateCode(): string {
  let code: string
  do {
    code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join('')
  } while (rooms.has(code))
  return code
}

const bankPayload: QuestionBankPayload = { questions: questionBank, fastMoney: fastMoneyBank }

/** Send each connected member of a room their own (role-redacted) state snapshot. */
function broadcast(code: string) {
  const game = rooms.get(code)
  if (!game) return
  for (const socket of io.of('/').sockets.values()) {
    if (socket.data.code === code && socket.data.clientId) {
      const state = game.toStateFor(socket.data.clientId)
      if (state) socket.emit('state', state)
    }
  }
}

function attachToRoom(socket: GameSocket, game: Game, clientId: string) {
  socket.data.code = game.code
  socket.data.clientId = clientId
  socket.join(game.code)
  game.onFx = (fx) => io.to(game.code).emit('fx', fx)
}

io.on('connection', (socket) => {
  socket.on('create_room', (payload: { clientId: string; name: string }, cb) => {
    if (!payload?.clientId) return cb?.({ ok: false, error: 'Missing client id.' })
    const game = new Game(generateCode())
    rooms.set(game.code, game)
    game.addMember(payload.clientId, payload.name?.trim().slice(0, 20) || 'Host', 'host')
    attachToRoom(socket, game, payload.clientId)
    cb?.({ ok: true, code: game.code })
    socket.emit('question_bank', bankPayload)
    broadcast(game.code)
  })

  socket.on('join_room', (payload: JoinPayload, cb) => {
    const code = payload?.code?.trim().toUpperCase()
    const game = code ? rooms.get(code) : undefined
    if (!game || !payload.clientId) return cb?.({ ok: false, error: 'Room not found.' })
    if (!['host', 'tv', 'player'].includes(payload.role)) {
      return cb?.({ ok: false, error: 'Invalid role.' })
    }
    const result = game.addMember(payload.clientId, payload.name?.trim().slice(0, 20) ?? '', payload.role)
    if (!result.ok) return cb?.(result)
    attachToRoom(socket, game, payload.clientId)
    game.lastActivity = Date.now()
    cb?.({ ok: true, code: game.code })
    if (payload.role === 'host') socket.emit('question_bank', bankPayload)
    broadcast(game.code)
  })

  /** Buzz timing is server-authoritative: we stamp Date.now() at receipt. */
  socket.on('buzz', (cb) => {
    const at = Date.now()
    const { code, clientId } = socket.data
    const game = code ? rooms.get(code) : undefined
    if (!game || !clientId) return cb?.({ result: 'inactive' })
    const result = game.buzz(clientId, at)
    game.lastActivity = Date.now()
    cb?.({ result })
    if (result === 'won' || result === 'late') broadcast(code!)
  })

  /** Wrap a host-only action: validates the sender is the room's host, then broadcasts. */
  const hostAction =
    <T>(fn: (game: Game, payload: T) => void) =>
    (payload: T) => {
      const { code, clientId } = socket.data
      const game = code ? rooms.get(code) : undefined
      if (!game || !clientId) return
      const member = game.members.get(clientId)
      if (!member || member.role !== 'host') return
      fn(game, payload)
      game.lastActivity = Date.now()
      broadcast(code!)
    }

  socket.on('host_assign_team', hostAction<{ playerId: string; team: TeamId | null }>((g, p) => g.assignTeam(p.playerId, p.team)))
  socket.on('host_set_team_name', hostAction<{ team: TeamId; name: string }>((g, p) => g.setTeamName(p.team, p.name)))
  socket.on('host_remove_player', hostAction<{ playerId: string }>((g, p) => g.removeMember(p.playerId)))
  socket.on('host_select_question', hostAction<{ questionId: string }>((g, p) => g.selectQuestion(p.questionId)))
  socket.on('host_cancel_question', hostAction((g) => g.cancelQuestion()))
  socket.on('host_set_multiplier', hostAction<{ multiplier: number }>((g, p) => g.setMultiplier(p.multiplier)))
  socket.on('host_show_question', hostAction((g) => g.showQuestion()))
  socket.on('host_set_faceoff', hostAction<{ aId: string | null; bId: string | null }>((g, p) => g.setFaceoffPair(p.aId, p.bId)))
  socket.on('host_arm_buzzers', hostAction((g) => g.armBuzzers()))
  socket.on('host_reset_buzzers', hostAction((g) => g.resetBuzzers()))
  socket.on('host_reveal', hostAction<{ index: number }>((g, p) => g.reveal(p.index)))
  socket.on('host_strike', hostAction((g) => g.strike()))
  socket.on('host_remove_strike', hostAction((g) => g.removeStrike()))
  socket.on('host_set_control', hostAction<{ team: TeamId }>((g, p) => g.setControl(p.team)))
  socket.on('host_start_steal', hostAction((g) => g.startSteal()))
  socket.on('host_back_to_board', hostAction((g) => g.backToBoard()))
  socket.on('host_award_pot', hostAction<{ team: TeamId }>((g, p) => g.awardPot(p.team)))
  socket.on('host_adjust_score', hostAction<{ team: TeamId; delta: number }>((g, p) => g.adjustScore(p.team, p.delta)))
  socket.on('host_next_round', hostAction((g) => g.nextRound()))
  socket.on('host_start_fastmoney', hostAction((g) => g.startFastMoney()))
  socket.on('host_fm_set_pass', hostAction<{ pass: 0 | 1 }>((g, p) => g.fmSetActivePass(p.pass)))
  socket.on('host_fm_set_current', hostAction<{ index: number }>((g, p) => g.fmSetCurrent(p.index)))
  socket.on('host_fm_set_answer', hostAction<{ pass: 0 | 1; questionIndex: number; answerIndex: number }>((g, p) => g.fmSetAnswer(p.pass, p.questionIndex, p.answerIndex)))
  socket.on('host_fm_reveal', hostAction<{ pass: 0 | 1; questionIndex: number }>((g, p) => g.fmReveal(p.pass, p.questionIndex)))
  socket.on('host_end_fastmoney', hostAction((g) => g.endFastMoney()))

  socket.on('disconnect', () => {
    const { code, clientId } = socket.data
    const game = code ? rooms.get(code) : undefined
    if (!game || !clientId) return
    // Another socket from the same device may still be attached (e.g. after a refresh race).
    const stillConnected = [...io.of('/').sockets.values()].some(
      (s) => s.id !== socket.id && s.data.code === code && s.data.clientId === clientId,
    )
    if (!stillConnected) {
      game.markDisconnected(clientId)
      game.lastActivity = Date.now()
      broadcast(code!)
    }
  })
})

// Drop rooms that have been fully abandoned for an hour.
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000
  for (const [code, game] of rooms) {
    if (game.allDisconnected() && game.lastActivity < cutoff) rooms.delete(code)
  }
}, 10 * 60 * 1000).unref()

// In production the server also serves the built client (single Render web service).
const clientDir = path.resolve(__dirname, '../dist/client')
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir))
  app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')))
} else {
  app.get('/', (_req, res) =>
    res.send('Family Feud server running. In dev, open the Vite dev server (default http://localhost:5173).'),
  )
}

httpServer.listen(PORT, () => {
  console.log(`Family Feud server listening on port ${PORT}`)
})
