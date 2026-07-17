import { io, type Socket } from 'socket.io-client'

// Same-origin connection: in dev Vite proxies /socket.io to the game server,
// in production the server serves the client itself.
export const socket: Socket = io({ autoConnect: false })

/** Stable per-device id so refreshes and reconnects resume the same seat. */
export function getClientId(): string {
  let id = localStorage.getItem('ff-client-id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('ff-client-id', id)
  }
  return id
}
