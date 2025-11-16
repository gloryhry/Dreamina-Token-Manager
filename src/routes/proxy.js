const express = require('express')
const axios = require('axios')
const router = express.Router()
const { logger } = require('../utils/logger')
const { apiKeyVerify, adminKeyVerify } = require('../middlewares/authorization')
const { getProxyTarget, setProxyTarget } = require('../utils/proxy-target')
const dreaminaAccountManager = require('../utils/dreamina-account')
const config = require('../config')

let rrIndex = 0

const pickAccount = () => {
  const all = dreaminaAccountManager.getAllAccounts() || []
  const available = all.filter(a => a && a.sessionid)
  if (available.length === 0) return null
  rrIndex = (rrIndex + 1) % available.length
  return available[rrIndex]
}

const setCorsHeaders = (req, res) => {
  // 允许任意来源；如需凭证可改为反射 origin 并设置 Access-Control-Allow-Credentials
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, X-Requested-With')
  res.setHeader('Access-Control-Max-Age', '600')
}

// 管理端：获取/设置透传目标地址
router.get('/proxy/target', adminKeyVerify, async (req, res) => {
  return res.json({ target: getProxyTarget() })
})

router.post('/proxy/target', adminKeyVerify, async (req, res) => {
  try {
    const { target } = req.body || {}
    if (typeof target !== 'string') {
      return res.status(400).json({ error: 'target must be string' })
    }
    setProxyTarget(target.trim())
    logger.info(`已更新透传目标地址 -> ${getProxyTarget()}`, 'PROXY')
    return res.json({ target: getProxyTarget() })
  } catch (e) {
    logger.error('更新透传目标地址失败', 'PROXY', '', e)
    return res.status(500).json({ error: 'update target failed' })
  }
})

// 处理跨域预检请求（不要求鉴权）
router.options('*', (req, res) => {
  setCorsHeaders(req, res)
  return res.sendStatus(204)
})

// 透传 /api/* 到目标，仅校验 Authorization，其余 header 与 body 透传
router.all('*', apiKeyVerify, async (req, res) => {
  try {
    const base = getProxyTarget()
    if (!base) {
      setCorsHeaders(req, res)
      return res.status(503).json({ error: 'proxy target not configured' })
    }

    // 跳过本服务已占用的子路由，防止递归或误伤
    if (req.path.startsWith('/dreamina') || req.path.startsWith('/events')) {
      return res.status(404).json({ error: 'not found' })
    }

    // 构建目标 URL: 去除 /api 前缀
    const originalPath = req.originalUrl || req.url || ''
    const pathWithoutApi = originalPath.replace(/^\/api/, '')
    const targetUrl = base.replace(/\/$/, '') + pathWithoutApi

    // 复制并覆盖 headers，仅替换 Authorization
    const incomingHeaders = { ...req.headers }
    // 清理可能导致上游异常的请求头，由 axios 重算/设置
    ;['host', 'connection', 'content-length', 'transfer-encoding', 'expect'].forEach(h => {
      if (incomingHeaders[h]) delete incomingHeaders[h]
      const H = h.charAt(0).toUpperCase() + h.slice(1)
      if (incomingHeaders[H]) delete incomingHeaders[H]
    })
    // 注意：authorization 在重试时动态写入（切换 sessionId）
    const headers = {
      ...incomingHeaders
    }

    const axiosConfig = {
      method: req.method,
      url: targetUrl,
      headers,
      // 对于 GET/HEAD 不发送 data
      data: ['GET', 'HEAD'].includes(req.method.toUpperCase()) ? undefined : req.body,
      // 保持超时适中，避免长挂
      timeout: config.proxyTimeoutMs,
      // 允许返回任意状态码，由我们转发
      validateStatus: () => true
    }

    // 按内容类型与方法修正透传体与请求头，避免参数丢失
    try {
      const methodUpper = (req.method || 'GET').toUpperCase()
      const ct = String(headers['content-type'] || headers['Content-Type'] || '').toLowerCase()
      const isGetLike = ['GET', 'HEAD'].includes(methodUpper)
      const isJson = ct.includes('application/json')
      const isFormUrl = ct.includes('application/x-www-form-urlencoded')
      const isMultipart = ct.includes('multipart/form-data')
      const isOctet = ct.includes('application/octet-stream')
      const isText = ct.startsWith('text/') || ct.includes('text/plain')

      if (isGetLike) {
        delete headers['content-length']
        delete headers['Content-Length']
        axiosConfig.data = undefined
      } else if (isFormUrl) {
        const form = new URLSearchParams()
        const body = req.body || {}
        Object.keys(body).forEach(k => {
          const v = body[k]
          if (Array.isArray(v)) v.forEach(item => form.append(k, item))
          else if (v !== undefined && v !== null) form.append(k, String(v))
        })
        axiosConfig.data = form.toString()
        delete headers['content-length']
        delete headers['Content-Length']
        if (!headers['content-type'] && !headers['Content-Type']) headers['content-type'] = 'application/x-www-form-urlencoded'
      } else if (isJson) {
        axiosConfig.data = req.body
        delete headers['content-length']
        delete headers['Content-Length']
        if (!headers['content-type'] && !headers['Content-Type']) headers['content-type'] = 'application/json'
      } else if (isMultipart || isOctet || isText || !ct) {
        // 对未解析/二进制/文本/未知类型：直接转发原始流
        axiosConfig.data = req
        // 保持 content-type（含 boundary）原值；content-length 若缺失则走 chunked
      } else {
        // 其他类型保守处理为原始流
        axiosConfig.data = req
      }

      axiosConfig.headers = headers
      axiosConfig.maxBodyLength = Infinity
      axiosConfig.maxContentLength = Infinity
    } catch (_) {}

    // 基于状态码的 sessionId 轮换重试
    // 触发条件：上游响应为 429/400/401/504
    // 注意：当请求体为流（如 multipart/octet），无法安全重试
    {
      const retryStatuses = new Set([400, 401, 429, 504])
      const maxRetries = Number.isFinite(config.proxyMaxRetry) ? config.proxyMaxRetry : 5
      const canRetryBody = axiosConfig.data !== req

      let attempt = 0
      let finalResp = null
      let lastStatusForLog = null

      while (true) {
        const accountForAttempt = pickAccount()
        if (!accountForAttempt || !accountForAttempt.sessionid) {
          setCorsHeaders(req, res)
          return res.status(503).json({ error: 'no available account' })
        }
        const sid = accountForAttempt.sessionid.startsWith('us-') ? accountForAttempt.sessionid : `us-${accountForAttempt.sessionid}`
        headers.authorization = `Bearer ${sid}`

        // 透传请求日志（脱敏）
        const _safeHeaders2 = { ...(headers || {}) }
        if (_safeHeaders2.authorization) _safeHeaders2.authorization = 'Bearer ****'
        if (_safeHeaders2.Authorization) _safeHeaders2.Authorization = 'Bearer ****'
        if (_safeHeaders2.cookie) _safeHeaders2.cookie = '****'
        if (_safeHeaders2.Cookie) _safeHeaders2.Cookie = '****'
        const _bodySize2 = (() => {
          try {
            if (!axiosConfig.data) return 0
            if (typeof axiosConfig.data === 'string') return Buffer.byteLength(axiosConfig.data)
            return Buffer.byteLength(JSON.stringify(axiosConfig.data))
          } catch (_) { return -1 }
        })()
        const _reqBodySnippet2 = (() => {
          if (!config.proxyLogBody) return undefined
          try {
            if (!axiosConfig.data) return ''
            if (Buffer.isBuffer(axiosConfig.data)) return '[buffer omitted]'
            const raw = typeof axiosConfig.data === 'string' ? axiosConfig.data : JSON.stringify(axiosConfig.data)
            const max = Number.isFinite(config.proxyLogBodyMax) ? config.proxyLogBodyMax : 2048
            return raw.length > max ? `${raw.slice(0, max)}...(${raw.length}B)` : raw
          } catch (_) { return '[unserializable]' }
        })()
        logger.network(`REQ[${attempt}] ${req.method} -> ${targetUrl}`, 'PROXY', {
          headers: _safeHeaders2,
          bodySize: _bodySize2,
          bodySnippet: _reqBodySnippet2
        })

        const _start = Date.now()
        const resp = await axios(axiosConfig)
        lastStatusForLog = resp.status

        // 响应日志摘要
        const _durationMs = Date.now() - _start
        const _contentType = (resp.headers && (resp.headers['content-type'] || resp.headers['Content-Type'])) || ''
        const _respSize = (() => {
          try {
            if (resp.headers && (resp.headers['content-length'] || resp.headers['Content-Length'])) {
              return parseInt(resp.headers['content-length'] || resp.headers['Content-Length'], 10)
            }
            const d = resp.data
            if (!d) return 0
            if (Buffer.isBuffer(d)) return d.length
            if (typeof d === 'string') return Buffer.byteLength(d)
            return Buffer.byteLength(JSON.stringify(d))
          } catch (_) { return -1 }
        })()
        const _respSnippet = (() => {
          if (!config.proxyLogBody) return undefined
          try {
            const ct = String(_contentType || '').toLowerCase()
            if (!ct.includes('json') && !ct.startsWith('text/')) return '[non-text content omitted]'
            const d = resp.data
            if (Buffer.isBuffer(d)) return '[buffer omitted]'
            const raw = typeof d === 'string' ? d : JSON.stringify(d)
            const max = Number.isFinite(config.proxyLogBodyMax) ? config.proxyLogBodyMax : 2048
            return raw.length > max ? `${raw.slice(0, max)}...(${raw.length}B)` : raw
          } catch (_) { return '[unserializable]' }
        })()
        logger.network(`RES[${attempt}] ${resp.status} <- ${targetUrl} ${_durationMs}ms`, 'PROXY', {
          contentType: _contentType,
          respSize: _respSize,
          bodySnippet: _respSnippet
        })

        if (retryStatuses.has(resp.status) && attempt < maxRetries && canRetryBody) {
          attempt += 1
          logger.warn(`上游状态 ${resp.status}，切换 sessionId 重试（第 ${attempt}/${maxRetries} 次）`, 'PROXY')
          continue
        }

        finalResp = resp
        break
      }

      // 透传最终响应
      Object.entries((finalResp && finalResp.headers) || {}).forEach(([k, v]) => {
        const _skip = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade']
        if (!_skip.includes(String(k || '').toLowerCase())) {
          try { res.setHeader(k, v) } catch (_) {}
        }
      })
      setCorsHeaders(req, res)

      if (!finalResp) {
        return res.status(502).json({ error: 'bad gateway', detail: `no response, last status: ${lastStatusForLog || 'unknown'}` })
      }

      return res.status(finalResp.status).send(finalResp.data)
    }

    // 透传请求日志（脱敏）
    const _safeHeaders = { ...(headers || {}) }
    if (_safeHeaders.authorization) _safeHeaders.authorization = 'Bearer ****'
    if (_safeHeaders.Authorization) _safeHeaders.Authorization = 'Bearer ****'
    if (_safeHeaders.cookie) _safeHeaders.cookie = '****'
    if (_safeHeaders.Cookie) _safeHeaders.Cookie = '****'
    const _bodySize = (() => {
      try {
        if (!axiosConfig.data) return 0
        if (typeof axiosConfig.data === 'string') return Buffer.byteLength(axiosConfig.data)
        return Buffer.byteLength(JSON.stringify(axiosConfig.data))
      } catch (_) { return -1 }
    })()
    // 可选：记录请求体（截断/脱敏）
    const _reqBodySnippet = (() => {
      if (!config.proxyLogBody) return undefined
      try {
        if (!axiosConfig.data) return ''
        if (Buffer.isBuffer(axiosConfig.data)) return '[buffer omitted]'
        const raw = typeof axiosConfig.data === 'string' ? axiosConfig.data : JSON.stringify(axiosConfig.data)
        const max = Number.isFinite(config.proxyLogBodyMax) ? config.proxyLogBodyMax : 2048
        return raw.length > max ? `${raw.slice(0, max)}...(${raw.length}B)` : raw
      } catch (_) { return '[unserializable]' }
    })()
    logger.network(`REQ ${req.method} -> ${targetUrl}`, 'PROXY', {
      headers: _safeHeaders,
      bodySize: _bodySize,
      bodySnippet: _reqBodySnippet
    })
    const _start = Date.now()
    const resp = await axios(axiosConfig)

    // 透传响应头（过滤 hop-by-hop）
    const hopByHop = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade'])
    // 响应日志摘要
    const _durationMs = Date.now() - _start
    const _contentType = (resp.headers && (resp.headers['content-type'] || resp.headers['Content-Type'])) || ''
    const _respSize = (() => {
      try {
        if (resp.headers && (resp.headers['content-length'] || resp.headers['Content-Length'])) {
          return parseInt(resp.headers['content-length'] || resp.headers['Content-Length'], 10)
        }
        const d = resp.data
        if (!d) return 0
        if (Buffer.isBuffer(d)) return d.length
        if (typeof d === 'string') return Buffer.byteLength(d)
        return Buffer.byteLength(JSON.stringify(d))
      } catch (_) { return -1 }
    })()
    // 可选：记录响应体（仅文本/JSON，截断）
    const _respSnippet = (() => {
      if (!config.proxyLogBody) return undefined
      try {
        const ct = String(_contentType || '').toLowerCase()
        if (!ct.includes('json') && !ct.startsWith('text/')) return '[non-text content omitted]'
        const d = resp.data
        if (Buffer.isBuffer(d)) return '[buffer omitted]'
        const raw = typeof d === 'string' ? d : JSON.stringify(d)
        const max = Number.isFinite(config.proxyLogBodyMax) ? config.proxyLogBodyMax : 2048
        return raw.length > max ? `${raw.slice(0, max)}...(${raw.length}B)` : raw
      } catch (_) { return '[unserializable]' }
    })()
    logger.network(`RES ${resp.status} <- ${targetUrl} ${_durationMs}ms`, 'PROXY', {
      contentType: _contentType,
      respSize: _respSize,
      bodySnippet: _respSnippet
    })
    Object.entries(resp.headers || {}).forEach(([k, v]) => {
      const _skip = ['connection', 'keep-alive', 'transfer-encoding', 'upgrade']
      if (!_skip.includes(String(k || '').toLowerCase())) {
        try { res.setHeader(k, v) } catch (_) {}
      }
    })
    // 覆盖/补充 CORS 响应头
    setCorsHeaders(req, res)

    return res.status(resp.status).send(resp.data)
  } catch (e) {
    logger.error('代理转发失败', 'PROXY', '', e)
    setCorsHeaders(req, res)
    if (e.code === 'ECONNABORTED' || (e.message && e.message.toLowerCase().includes('timeout'))) {
      return res.status(504).json({ error: 'gateway timeout', detail: e.message })
    }
    return res.status(502).json({ error: 'bad gateway', detail: e.message })
  }
})

module.exports = router
