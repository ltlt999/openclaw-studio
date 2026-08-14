import type { RpcFrame, RpcRequest } from './types'

let seq = 0

export function createId(): string {
  seq += 1
  return `c${seq}`
}

export function buildRequest(
  method: string,
  params?: Record<string, any>,
  id?: string,
): RpcRequest {
  return { type: 'req', id: id ?? createId(), method, params }
}

export function parseFrame(raw: string): RpcFrame | null {
  try {
    return JSON.parse(raw) as RpcFrame
  } catch {
    return null
  }
}

export function isResponse(frame: RpcFrame): boolean {
  return frame.type === 'res'
}

export function isEvent(frame: RpcFrame): boolean {
  return frame.type === 'event'
}
