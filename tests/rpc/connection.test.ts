import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocketServer, WebSocket } from 'ws'
import type { AddressInfo } from 'node:net'
import { GatewayConnection } from '../../src/rpc/connection'

let server: WebSocketServer
let port: number
const clientSockets = new Set<WebSocket>()

beforeAll(async () => {
  server = new WebSocketServer({ port: 0 })
  await new Promise<void>((resolve) => server.once('listening', resolve))
  port = (server.address() as AddressInfo).port

  server.on('connection', (socket) => {
    clientSockets.add(socket)
    socket.on('close', () => clientSockets.delete(socket))
    // 协议 v4 握手：先下发 challenge
    socket.send(
      JSON.stringify({
        type: 'event',
        event: 'connect.challenge',
        payload: { nonce: 'test-nonce', ts: Date.now() },
      }),
    )

    socket.on('message', (data) => {
      const frame = JSON.parse(String(data))
      if (frame.type !== 'req') return

      if (frame.method === 'connect') {
        socket.send(
          JSON.stringify({
            type: 'res',
            id: frame.id,
            ok: true,
            payload: {
              type: 'hello-ok',
              protocol: 4,
              server: { version: 'mock-1.0.0' },
              features: { methods: ['sessions.list'], events: ['chat'] },
              auth: { role: 'operator', scopes: ['operator.read', 'operator.write'] },
            },
          }),
        )
        return
      }

      // 其它请求：回显 method + params，供断言
      socket.send(
        JSON.stringify({
          type: 'res',
          id: frame.id,
          ok: true,
          payload: { method: frame.method, echo: frame.params },
        }),
      )
    })
  })
})

afterAll(() => {
  clientSockets.forEach((s) => s.close())
  server.close()
})

async function waitFor(fn: () => boolean, timeout = 3000): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('waitFor 超时')
    await new Promise((r) => setTimeout(r, 20))
  }
}

describe('GatewayConnection（对接 mock Gateway）', () => {
  it('完成 connect 握手并变为 connected', async () => {
    const conn = new GatewayConnection({ url: `ws://127.0.0.1:${port}` })
    conn.connect()
    await waitFor(() => conn.status === 'connected')
    expect(conn.status).toBe('connected')
    expect(conn.hello?.type).toBe('hello-ok')
    conn.disconnect()
  })

  it('request 能收到正确的响应 payload', async () => {
    const conn = new GatewayConnection({ url: `ws://127.0.0.1:${port}` })
    conn.connect()
    await waitFor(() => conn.status === 'connected')

    const res = await conn.request('sessions.list', { foo: 'bar' })
    expect(res.method).toBe('sessions.list')
    expect(res.echo).toEqual({ foo: 'bar' })
    conn.disconnect()
  })

  it('并发请求按 id 正确匹配', async () => {
    const conn = new GatewayConnection({ url: `ws://127.0.0.1:${port}` })
    conn.connect()
    await waitFor(() => conn.status === 'connected')

    const [a, b] = await Promise.all([
      conn.request('models.list'),
      conn.request('agents.list'),
    ])
    expect(a.method).toBe('models.list')
    expect(b.method).toBe('agents.list')
    conn.disconnect()
  })
})
