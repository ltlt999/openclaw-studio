import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createPublicKey, verify } from 'node:crypto'
import {
  deriveDeviceId,
  loadOrCreateDeviceIdentity,
  buildDeviceSignature,
  buildConnectDevice,
  isPairingRequiredError,
  defaultStateDir,
  DEFAULT_SCOPES,
  CLIENT_ID,
  CLIENT_MODE,
} from '../../bin/lib/device-auth.mjs'

function tmpStateDir() {
  return mkdtempSync(join(tmpdir(), 'oc-studio-test-'))
}

describe('device-auth', () => {
  it('deriveDeviceId 是公钥的 sha256', () => {
    const a = deriveDeviceId(
      '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAiX8wKwZgZ8VQxJKQVVo+HZ9UqQoCQa6XuD7g+qL0lWo=\n-----END PUBLIC KEY-----\n',
    )
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })

  it('loadOrCreateDeviceIdentity 生成并持久化设备', () => {
    const dir = tmpStateDir()
    const d1 = loadOrCreateDeviceIdentity(dir)
    expect(d1.deviceId).toMatch(/^[a-f0-9]{64}$/)
    expect(d1.privateKeyPem).toContain('PRIVATE KEY')
    const d2 = loadOrCreateDeviceIdentity(dir) // 再次加载应复用
    expect(d2.deviceId).toBe(d1.deviceId)
    rmSync(dir, { recursive: true, force: true })
  })

  it('buildDeviceSignature 产生可被网关验证的签名', () => {
    const dir = tmpStateDir()
    const dev = loadOrCreateDeviceIdentity(dir)
    const sig = buildDeviceSignature({
      device: dev,
      token: 'tok',
      nonce: 'n',
      signedAtMs: 123456,
    })
    // 验证签名：用公钥验证 payload 的 v3 签名
    const payload = [
      'v3', dev.deviceId, CLIENT_ID, CLIENT_MODE, 'operator',
      DEFAULT_SCOPES.join(','), '123456', 'tok', 'n', 'web', '',
    ].join('|')
    const publicKey = createPublicKey(dev.publicKeyPem)
    const valid = verify(null, Buffer.from(payload), publicKey, Buffer.from(sig, 'base64url'))
    expect(valid).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('buildConnectDevice 返回 device 字段结构', () => {
    const dir = tmpStateDir()
    const dev = loadOrCreateDeviceIdentity(dir)
    const device = buildConnectDevice(dev, 'tok', { nonce: 'n', ts: 99 })
    expect(device.id).toBe(dev.deviceId)
    expect(device.publicKey).toContain('PUBLIC KEY')
    expect(device.signedAt).toBe(99)
    expect(device.nonce).toBe('n')
    expect(device.signature).toMatch(/^[A-Za-z0-9_-]+$/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('isPairingRequiredError 识别配对错误', () => {
    expect(isPairingRequiredError({ message: 'pairing required: device is not approved yet' })).toBe(true)
    expect(isPairingRequiredError({ details: { code: 'PAIRING_REQUIRED' } })).toBe(true)
    expect(isPairingRequiredError({ message: 'invalid token' })).toBe(false)
  })

  it('defaultStateDir 指向 ~/.openclaw-studio', () => {
    expect(defaultStateDir()).toMatch(/openclaw-studio$/)
  })
})
