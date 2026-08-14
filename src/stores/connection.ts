import { defineStore } from 'pinia'
import type { ConnectionStatus } from '../rpc/connection'
import { initConnection, getConnection } from '../rpc/client'

export const useConnectionStore = defineStore('connection', {
  state: () => ({
    status: 'disconnected' as ConnectionStatus,
    error: null as string | null,
    token: localStorage.getItem('openclaw.token') || '',
    password: localStorage.getItem('openclaw.password') || '',
  }),
  getters: {
    connected: (s) => s.status === 'connected',
  },
  actions: {
    init() {
      const conn = initConnection({
        token: this.token || undefined,
        password: this.password || undefined,
      })
      conn.onStatus((s) => {
        this.status = s
        this.error = getConnection().lastError
      })
      conn.connect()
    },
    reconnect() {
      const conn = getConnection()
      conn.disconnect()
      conn.setOptions({ token: this.token || undefined, password: this.password || undefined })
      conn.connect()
    },
    setAuth(token: string, password: string) {
      this.token = token
      this.password = password
      localStorage.setItem('openclaw.token', token)
      if (password) localStorage.setItem('openclaw.password', password)
      this.reconnect()
    },
  },
})
