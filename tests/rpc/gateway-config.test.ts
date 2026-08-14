import { describe, it, expect } from 'vitest'
import {
  parseGatewayConfig,
  injectAuth,
  isLoopbackGateway,
} from '../../bin/lib/gateway-config.mjs'

describe('parseGatewayConfig', () => {
  it('提取 token / password / mode / port', () => {
    const cfg = parseGatewayConfig({
      gateway: {
        port: 19999,
        auth: { mode: 'token', token: ' abc123 ', password: 'p' },
      },
    })
    expect(cfg?.token).toBe('abc123') // trim
    expect(cfg?.password).toBe('p')
    expect(cfg?.mode).toBe('token')
    expect(cfg?.port).toBe(19999)
  })

  it('无 gateway 段时返回 null', () => {
    expect(parseGatewayConfig({ channels: {} })).toBeNull()
  })

  it('空 token 视为未设置', () => {
    const cfg = parseGatewayConfig({ gateway: { auth: { token: '  ' } } })
    expect(cfg?.token).toBeUndefined()
  })
})

describe('injectAuth', () => {
  it('向 connect 帧注入 token 与 password', () => {
    const frame = JSON.stringify({
      type: 'req',
      id: 'connect',
      method: 'connect',
      params: { minProtocol: 4 },
    })
    const out = JSON.parse(injectAuth(frame, { token: 't', password: 'p' }))
    expect(out.params.auth).toEqual({ token: 't', password: 'p' })
  })

  it('非 connect 帧原样透传', () => {
    const frame = JSON.stringify({ type: 'req', id: 'x', method: 'sessions.list' })
    expect(injectAuth(frame, { token: 't' })).toBe(frame)
  })

  it('无鉴权时原样透传', () => {
    const frame = JSON.stringify({ type: 'req', id: 'connect', method: 'connect' })
    expect(injectAuth(frame, {})).toBe(frame)
  })

  it('非法 JSON 原样返回', () => {
    expect(injectAuth('not-json', { token: 't' })).toBe('not-json')
  })
})

describe('isLoopbackGateway', () => {
  it('识别 loopback 地址', () => {
    expect(isLoopbackGateway('ws://127.0.0.1:18789')).toBe(true)
    expect(isLoopbackGateway('ws://localhost:18789')).toBe(true)
    expect(isLoopbackGateway('ws://0.0.0.0:18789')).toBe(true)
  })
  it('识别远程地址', () => {
    expect(isLoopbackGateway('ws://192.168.1.10:18789')).toBe(false)
    expect(isLoopbackGateway('ws://openclaw.example.com:18789')).toBe(false)
  })
})
