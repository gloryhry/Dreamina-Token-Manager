const express = require('express')
const bodyParser = require('body-parser')
const config = require('./config/index.js')
const cors = require('cors')
const { logger } = require('./utils/logger')
const app = express()
const path = require('path')
const fs = require('fs')
const verifyRouter = require('./routes/verify.js')
const dreaminaAccountsRouter = require('./routes/dreamina-accounts.js')
const { addClient: addSseClient } = require('./utils/sse')
const { validateApiKey } = require('./middlewares/authorization')

if (config.dataSaveMode === 'file') {
  if (!fs.existsSync(path.join(__dirname, '../data/data.json'))) {
    fs.writeFileSync(path.join(__dirname, '../data/data.json'), JSON.stringify({"accounts": [] }, null, 2))
  }
}

app.use(bodyParser.json({ limit: '128mb' }))
app.use(bodyParser.urlencoded({ limit: '128mb', extended: true }))
app.use(cors())

// API路由
app.use(verifyRouter)
app.use('/api/dreamina', dreaminaAccountsRouter)

// SSE 事件流（用于前端接收异步任务完成通知）
app.get('/api/events', (req, res) => {
  try {
    const providedKey = req.query.apiKey || req.headers['authorization'] || req.headers['Authorization'] || req.headers['x-api-key']
    const { isValid, isAdmin } = validateApiKey(providedKey)
    if (!isValid || !isAdmin) {
      return res.status(403).end()
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders && res.flushHeaders()

    addSseClient(res)
  } catch (e) {
    logger.error('SSE 连接建立失败', 'SERVER', '', e)
    res.status(500).end()
  }
})

app.use(express.static(path.join(__dirname, '../public/dist')))

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dist/index.html'), (err) => {
    if (err) {
      logger.error('管理页面加载失败', 'SERVER', '', err)
      res.status(500).send('服务器内部错误')
    }
  })
})

// 处理错误中间件（必须放在所有路由之后）
app.use((err, req, res, next) => {
  logger.error('服务器内部错误', 'SERVER', '', err)
  res.status(500).send('服务器内部错误')
})


// 服务器启动信息
const serverInfo = {
  address: config.listenAddress || 'localhost',
  port: config.listenPort,
  dataSaveMode: config.dataSaveMode,
  logLevel: config.logLevel,
  enableFileLog: config.enableFileLog
}

if (config.listenAddress) {
  app.listen(config.listenPort, config.listenAddress, () => {
    logger.server('服务器启动成功', 'SERVER', serverInfo)
    logger.info('Dreamina Token Manager 启动成功', 'SERVER')
  })
} else {
  app.listen(config.listenPort, () => {
    logger.server('服务器启动成功', 'SERVER', serverInfo)
    logger.info('Dreamina Token Manager 启动成功', 'SERVER')
  })
}
