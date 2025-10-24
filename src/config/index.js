const dotenv = require('dotenv')
dotenv.config()

/**
 * 解析API_KEY环境变量，支持逗号分隔的多个key
 * @returns {Object} 包含apiKeys数组和adminKey的对象
 */
const parseApiKeys = () => {
    const apiKeyEnv = process.env.API_KEY
    if (!apiKeyEnv) {
        return { apiKeys: [], adminKey: null }
    }

    const keys = apiKeyEnv.split(',').map(key => key.trim()).filter(key => key.length > 0)
    return {
        apiKeys: keys,
        adminKey: keys.length > 0 ? keys[0] : null
    }
}

const { apiKeys, adminKey } = parseApiKeys()

const config = {
    dataSaveMode: process.env.DATA_SAVE_MODE || "none",
    apiKeys: apiKeys,
    adminKey: adminKey,
    proxyTarget: process.env.PROXY_TARGET || '',
    proxyTimeoutMs: parseInt(process.env.PROXY_TIMEOUT_MS, 10) || 600000,
    simpleModelMap: process.env.SIMPLE_MODEL_MAP === 'true' ? true : false,
    listenAddress: process.env.LISTEN_ADDRESS || null,
    listenPort: process.env.SERVICE_PORT || 3000,
    searchInfoMode: process.env.SEARCH_INFO_MODE === 'table' ? "table" : "text",
    outThink: process.env.OUTPUT_THINK === 'true' ? true : false,
    redisURL: process.env.REDIS_URL || null,
    autoRefresh: true,
    autoRefreshInterval: 6 * 60 * 60,
    cacheMode: process.env.CACHE_MODE || "default",
    logLevel: process.env.LOG_LEVEL || "INFO",
    enableFileLog: process.env.ENABLE_FILE_LOG === 'true',
    logDir: process.env.LOG_DIR || "./logs",
    maxLogFileSize: parseInt(process.env.MAX_LOG_FILE_SIZE) || 10,
    maxLogFiles: parseInt(process.env.MAX_LOG_FILES) || 5,
    proxyLogBody: process.env.PROXY_LOG_BODY === 'true',
    proxyLogBodyMax: parseInt(process.env.PROXY_LOG_BODY_MAX, 10) || 2048,
    // 时区与每日刷新配置
    timeZone: process.env.TIMEZONE || 'UTC',
    dailySessionUpdateTime: (process.env.DAILY_SESSION_UPDATE_TIME || '').trim(), // HH:mm，留空关闭
    // Playwright 浏览器登录代理配置
    browserProxyEnable: process.env.BROWSER_PROXY_ENABLE === 'true',
    browserProxyUrl: (process.env.BROWSER_PROXY_URL || '').trim(),
    browserProxyUsername: (process.env.BROWSER_PROXY_USERNAME || '').trim(),
    browserProxyPassword: (process.env.BROWSER_PROXY_PASSWORD || '').trim(),
}

module.exports = config
