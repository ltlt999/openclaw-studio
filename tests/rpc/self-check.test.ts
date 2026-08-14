import { describe, it, expect, afterEach } from 'vitest'
import { WebSocketServer, WebSocket } from 'ws'
import type { AddressInfo } from 'node:net'
import { probeGateway } from '../../bin/lib/self-check.mjs'

const servers: WebSocketServer[] = []

function startMockGateway({ reject = false }: { reject?: boolean } = {}) {
  const server = new WebSocketServer({ port: 0 })
  servers.push(server)
  return new Promise<number>((resolve) => {
    server.on('connection', (socket) => {
      socket.send(
        JSON.stringify({
          type: 'event',
          event: 'connect.challenge',
          payload: { nonce: 'n', ts: Date.now() },
        }),
      )
      socket.on('message', (data) => {
        const frame = JSON.parse(String(data))
        if (frame?.type === 'req' && frame.method === 'connect') {
          if (reject) {
            socket.send(
              JSON.stringify({
                type: 'res',
                id: frame.id,
                ok: false,
                code: 'AUTH_REJECTED',
                message: 'invalid token',
              }),
            )
          } else {
            socket.send(
              JSON.stringify({ type: 'res', id: frame.id, ok: true, payload: { type: 'hello-ok', protocol: 4 } }),
            )
          }
        }
      })
    })
    server.once('listening', () => resolve((server.address() as AddressInfo).port))
  })
}

afterEach(() => {
  servers.splice(0).forEach((s) => s.close())
})

describe('probeGateway', () => {
  it('网关可达且鉴权通过 → auth-ok', async () => {
    const port = await startMockGateway()
    const r = await probeGateway({ url: `ws://127.0.0.1:${port}` })
    expect(r.ok).toBe(true)
    expect(r.kind).toBe('auth-ok')
  })

  it('鉴权被拒 → auth-rejected，并带网关返回的原因', async () => {
    const port = await startMockGateway({ reject: true })
    const r = await probeGateway({ url: `ws://127.0.0.1:${port}` })
    expect(r.ok).toBe(false)
    expect(r.kind).toBe('auth-rejected')
    expect(r.message).toContain('invalid token')
  })

  it('网关不可达 → unreachable', async () => {
    const r = await probeGateway({ url: 'ws://127.0.0.1:1', timeoutMs: 3000 })
    expect(r.ok).toBe(false)
    expect(['unreachable', 'closed']).toContain(r.kind)
  })
})
