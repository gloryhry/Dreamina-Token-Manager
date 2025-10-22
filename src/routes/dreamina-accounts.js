const express = require('express')
const router = express.Router()
const dreaminaAccountManager = require('../utils/dreamina-account')
const { logger } = require('../utils/logger')
const { adminKeyVerify } = require('../middlewares/authorization')
const DataPersistence = require('../utils/data-persistence')
const sse = require('../utils/sse')

const dataPersistence = new DataPersistence()

router.get('/getAllAccounts', adminKeyVerify, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const pageSize = parseInt(req.query.pageSize) || 1000
    const start = (page - 1) * pageSize

    const allAccounts = dreaminaAccountManager.getAllAccounts()
    const total = allAccounts.length

    const paginatedAccounts = allAccounts.slice(start, start + pageSize)

    const accounts = paginatedAccounts.map(account => ({
      email: account.email,
      password: account.password,
      sessionid: account.sessionid,
      sessionid_expires: account.sessionid_expires
    }))

    res.json({ total, page, pageSize, data: accounts })
  } catch (error) {
    logger.error('获取 Dreamina 账号列表失败', 'DREAMINA', '', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/setAccount', adminKeyVerify, async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' })
    }

    const exists = dreaminaAccountManager.getAllAccounts().find(item => item.email === email)
    if (exists) {
      return res.status(409).json({ error: '账号已存在' })
    }

    const jobId = `acc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    res.status(202).json({ message: '任务已提交', jobId, email })

    setImmediate(async () => {
      try {
        const success = await dreaminaAccountManager.addAccount(email, password)
        sse.broadcast('account:add:done', { jobId, email, success })
      } catch (err) {
        logger.error('后台创建账号任务失败', 'DREAMINA', '', err)
        sse.broadcast('account:add:done', { jobId, email, success: false, error: err.message })
      }
    })
  } catch (error) {
    logger.error('创建 Dreamina 账号失败', 'DREAMINA', '', error)
    res.status(500).json({ error: error.message })
  }
})

router.delete('/deleteAccount', adminKeyVerify, async (req, res) => {
  try {
    const { email } = req.body

    const exists = dreaminaAccountManager.getAllAccounts().find(item => item.email === email)
    if (!exists) {
      return res.status(404).json({ error: '账号不存在' })
    }

    const success = await dreaminaAccountManager.removeAccount(email)

    if (success) {
      await dataPersistence.saveAllAccounts(dreaminaAccountManager.getAllAccounts())
      res.json({ message: 'Dreamina 账号删除成功' })
    } else {
      res.status(500).json({ error: 'Dreamina 账号删除失败' })
    }
  } catch (error) {
    logger.error('删除 Dreamina 账号失败', 'DREAMINA', '', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/setAccounts', adminKeyVerify, async (req, res) => {
  try {
    let { accounts } = req.body
    if (!accounts) {
      return res.status(400).json({ error: '账号列表不能为空' })
    }

    const list = accounts
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(item => item !== '')

    const jobId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    res.status(202).json({ message: '批量任务已提交', jobId, total: list.length })

    setImmediate(async () => {
      let successCount = 0
      const failed = []

      for (const line of list) {
        const [email, password] = line.split(':')
        if (!email || !password) continue

        const exists = dreaminaAccountManager.getAllAccounts().find(item => item.email === email)
        if (exists) {
          failed.push({ email, reason: 'exists' })
          continue
        }

        try {
          const ok = await dreaminaAccountManager.addAccount(email, password)
          if (ok) successCount++
          else failed.push({ email, reason: 'failed' })
        } catch (e) {
          failed.push({ email, reason: e.message || 'failed' })
        }
      }

      sse.broadcast('account:batchAdd:done', {
        jobId,
        total: list.length,
        successCount,
        failed
      })
    })
  } catch (error) {
    logger.error('批量创建 Dreamina 账号失败', 'DREAMINA', '', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/refreshAccount', adminKeyVerify, async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      return res.status(400).json({ error: '邮箱不能为空' })
    }

    const exists = dreaminaAccountManager.getAllAccounts().find(item => item.email === email)
    if (!exists) {
      return res.status(404).json({ error: '账号不存在' })
    }

    const success = await dreaminaAccountManager.refreshAccount(email)

    if (success) {
      res.json({ message: 'Dreamina 账号 SessionID 刷新成功', email })
    } else {
      res.status(500).json({ error: 'Dreamina 账号 SessionID 刷新失败' })
    }
  } catch (error) {
    logger.error('刷新 Dreamina 账号 SessionID 失败', 'DREAMINA', '', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/refreshAllAccounts', adminKeyVerify, async (req, res) => {
  try {
    const { thresholdHours = 24 } = req.body
    const refreshedCount = await dreaminaAccountManager.autoRefreshSessionIds(thresholdHours)
    res.json({ message: 'Dreamina 批量刷新完成', refreshedCount, thresholdHours })
  } catch (error) {
    logger.error('批量刷新 Dreamina 账号 SessionID 失败', 'DREAMINA', '', error)
    res.status(500).json({ error: error.message })
  }
})

router.post('/forceRefreshAllAccounts', adminKeyVerify, async (req, res) => {
  try {
    const refreshedCount = await dreaminaAccountManager.autoRefreshSessionIds(8760)
    res.json({ message: 'Dreamina 强制刷新完成', refreshedCount, totalAccounts: dreaminaAccountManager.getAllAccounts().length })
  } catch (error) {
    logger.error('强制刷新 Dreamina 账号 SessionID 失败', 'DREAMINA', '', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router

