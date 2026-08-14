import { GatewayConnection, type ConnectionOptions } from './connection'
import { GatewayClient } from './methods'

let conn: GatewayConnection | null = null
let client: GatewayClient | null = null

export function initConnection(opts: ConnectionOptions = {}): GatewayConnection {
  if (conn) {
    conn.setOptions(opts)
  } else {
    conn = new GatewayConnection(opts)
    client = new GatewayClient(conn)
  }
  return conn
}

export function getConnection(): GatewayConnection {
  return conn ?? initConnection()
}

export function getClient(): GatewayClient {
  getConnection()
  return client as GatewayClient
}
