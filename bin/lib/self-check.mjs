// 启动时网关自检：探测连通性 + 鉴权结果
import { WebSocket } from 'ws'

// 网关把错误放在 error 对象里：{ ok:false, error:{ code, message, details } }
function extractErrorText(frame) {
  const e = frame?.error
  const parts = [
    e?.code,
    e?.details?.code,
    e?.details?.reason,
    e?.message,
    frame?.message,
    frame?.code,
  ].filter((v) => typeof v === 'string' && v)
  return parts.join(' · ') || ''
}

export function probeGateway({ url, origin, enrich, timeoutMs = 5000 }) {
  return new Promise((resolve) => {
    let ws
    let done = false
    let sent = false
    let noChallengeTimer = null
    let challenge = null

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
        const params = {
          minProtocol: 4,
          maxProtocol: 4,
          client: { id: 'openclaw-control-ui', version: '0.1.0', platform: 'web', mode: 'ui' },
          role: 'operator',
          scopes: ['operator.read', 'operator.write', 'operator.talk', 'operator.admin'],
        }
        const enriched = enrich ? enrich(params, challenge) : params
        ws.send(JSON.stringify({ type: 'req', id: 'probe', method: 'connect', params: enriched }))
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
        challenge = { nonce: frame.payload?.nonce, ts: frame.payload?.ts }
        sendConnect()
        return
      }
      if (frame?.type === 'res' && frame.id === 'probe') {
        clearTimeout(timer)
        if (frame.ok) finish({ ok: true, kind: 'auth-ok', message: '网关可达且鉴权通过' })
        else {
          const why = extractErrorText(frame) || '未知原因'
          finish({ ok: false, kind: 'auth-rejected', message: `网关可达但鉴权被拒: ${why}` })
        }
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
