// OpenClaw 设备认证：生成/复用设备身份，构造设备签名字段
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  generateKeyPairSync,
  createHash,
  createPublicKey,
  createPrivateKey,
  sign,
} from 'node:crypto'

export const CLIENT_ID = 'webchat-ui'
export const CLIENT_MODE = 'webchat'
export const CLIENT_VERSION = '0.1.0'
export const DEFAULT_SCOPES = ['operator.read', 'operator.write', 'operator.talk', 'operator.admin']

export function defaultStateDir() {
  return path.join(os.homedir(), '.openclaw-studio')
}

export function deriveDeviceId(publicKeyPem) {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' })
  return createHash('sha256').update(der.subarray(der.length - 32)).digest('hex')
}

export function loadOrCreateDeviceIdentity(stateDir = defaultStateDir()) {
  const file = path.join(stateDir, 'device.json')
  try {
    if (fs.existsSync(file)) {
      const d = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (d.deviceId && d.privateKeyPem) return { ...d, path: file }
    }
  } catch {
    // ignore and recreate
  }
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' })
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' })
  const dev = { deviceId: deriveDeviceId(publicKeyPem), publicKeyPem, privateKeyPem }
  fs.mkdirSync(stateDir, { recursive: true })
  fs.writeFileSync(file, JSON.stringify(dev, null, 2), { mode: 0o600 })
  return { ...dev, path: file }
}

export function loadStoredDeviceToken(stateDir = defaultStateDir()) {
  try {
    const file = path.join(stateDir, 'device-token.json')
    if (fs.existsSync(file)) {
      const d = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (typeof d.token === 'string' && d.token) return d.token
    }
  } catch {
    // ignore
  }
  return null
}

export function storeDeviceToken(stateDir, token) {
  try {
    if (!token) return
    fs.mkdirSync(stateDir, { recursive: true })
    fs.writeFileSync(path.join(stateDir, 'device-token.json'), JSON.stringify({ token }, null, 2), {
      mode: 0o600,
    })
  } catch {
    // ignore
  }
}

// 构造 v3 设备签名
export function buildDeviceSignature({ device, token, nonce, signedAtMs, platform = 'web', deviceFamily = '' }) {
  const payload = [
    'v3',
    device.deviceId,
    CLIENT_ID,
    CLIENT_MODE,
    'operator',
    DEFAULT_SCOPES.join(','),
    String(signedAtMs),
    token || '',
    nonce,
    platform,
    deviceFamily,
  ].join('|')
  const key = createPrivateKey(device.privateKeyPem)
  return sign(null, Buffer.from(payload), key).toString('base64url')
}

// 构造 connect 帧的 device 字段
export function buildConnectDevice(device, token, challenge) {
  return {
    id: device.deviceId,
    publicKey: device.publicKeyPem,
    signature: buildDeviceSignature({ device, token, nonce: challenge.nonce, signedAtMs: challenge.ts }),
    signedAt: challenge.ts,
    nonce: challenge.nonce,
  }
}

// 判断网关拒绝是否属于「待配对」
export function isPairingRequiredError(error) {
  const text = [error?.code, error?.message, error?.details?.code, error?.details?.reason]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return text.includes('pairing') || text.includes('not approved')
}
