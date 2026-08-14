// 启动时网关自检：探测连通性 + 鉴权结果
import { WebSocket } from 'ws'
import { injectAuth } from './gateway-config.mjs'

export function probeGateway({ url, auth, origin, timeoutMs = 5000 }) {
  return new Promise((resolve) => {
    let ws
    let done = false
    let sent = false
    let noChallengeTimer = null

    const finish = (result) => {
      if (done) return
      done = true
      if (noChallengeTimer) clearTimeout(noChallengeTimer)
      try { ws?.close() } catch {}
      resolve(result)
    }

    const sendConnect = () => {
      if (sent || done) return
      sent = true
      if (noChallengeTimer) clearTimeout(noChallengeTimer)
      try {
        const req = injectAuth(
          JSON.stringify({
            type: 'req',
            id: 'probe',
            method: 'connect',
            params: {
              minProtocol: 4,
              maxProtocol: 4,
              client: { id: 'webchat-ui', version: '0.1.0', platform: 'node', mode: 'webchat' },
              role: 'operator',
              scopes: ['operator.read', 'operator.write'],
            },
          }),
          auth,
        )
        ws.send(req)
      } catch (e) {
        finish({ ok: false, kind: 'error', message: `发送连接请求失败: ${e.message}` })
      }
    }

    try {
      ws = new WebSocket(url, origin ? { origin } : undefined)
    } catch (e) {
      finish({ ok: false, kind: 'unreachable', message: `无法建立连接: ${e.message}` })
      return
    }

    const timer = setTimeout(() => finish({ ok: false, kind: 'timeout', message: `网关无响应（${timeoutMs}ms）` }), timeoutMs)

    ws.onopen = () => {
      noChallengeTimer = setTimeout(sendConnect, 800)
    }
    ws.onmessage = (ev) => {
      let frame
      try { frame = JSON.parse(String(ev.data)) } catch { return }
      if (frame?.type === 'event' && frame.event === 'connect.challenge') {
        sendConnect()
        return
      }
      if (frame?.type === 'res' && frame.id === 'probe') {
        clearTimeout(timer)
        if (frame.ok) finish({ ok: true, kind: 'auth-ok', message: '网关可达且鉴权通过' })
        else finish({ ok: false, kind: 'auth-rejected', message: `网关可达但鉴权被拒: ${frame.message || frame.code || '未知原因'}` })
      }
    }
    ws.onerror = (e) => finish({ ok: false, kind: 'unreachable', message: `无法连接网关: ${e?.message || '连接错误'}` })
    ws.onclose = (e) => {
      finish({
        ok: false,
        kind: 'closed',
        message: `网关连接被关闭(code=${e.code})${e.code === 1008 ? '，通常表示鉴权被拒' : ''}`,
      })
    }
  })
}
