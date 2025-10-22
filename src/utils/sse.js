const { logger } = require('./logger')

// Simple in-memory SSE client registry
const clients = new Map()
let nextClientId = 1

const HEARTBEAT_INTERVAL = 15000

function addClient(res) {
  const id = nextClientId++
  clients.set(id, { res })

  try {
    res.write(`event: connected\n`)
    res.write(`data: ${JSON.stringify({ id })}\n\n`)
  } catch (e) {
    logger.warn('SSE 初始写入失败', 'SSE', '', e)
  }

  res.on('close', () => {
    clients.delete(id)
  })

  return id
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const [id, client] of clients.entries()) {
    try {
      client.res.write(payload)
    } catch (e) {
      logger.warn(`SSE 向客户端 ${id} 写入失败，移除连接`, 'SSE')
      clients.delete(id)
    }
  }
}

// Heartbeat to keep connections alive
setInterval(() => {
  for (const client of clients.values()) {
    try {
      client.res.write(`event: ping\n`)
      client.res.write(`data: ${Date.now()}\n\n`)
    } catch (e) {
      // Swallow; cleanup happens on next broadcast
    }
  }
}, HEARTBEAT_INTERVAL)

module.exports = {
  addClient,
  broadcast,
}

