const config = require('../config/index.js')
const DataPersistence = require('./data-persistence')
const DreaminaTokenManager = require('./dreamina-token-manager')
const { logger } = require('./logger')

class DreaminaAccount {
    constructor() {
        this.dataPersistence = new DataPersistence()
        this.tokenManager = new DreaminaTokenManager()
        
        this.dreaminaAccounts = []
        this.isInitialized = false
        this._dailyTimer = null
        this._lastDailyRunDate = null
        
        this._initialize()
    }

    async _initialize() {
        try {
            await this.loadAccounts()
            
            if (config.autoRefresh) {
                this.refreshInterval = setInterval(
                    () => this.autoRefreshSessionIds(),
                    (config.autoRefreshInterval || 21600) * 1000
                )
            }
            
            // 设置每日定时刷新（按指定时区与时间）
            this._setupDailyRefresh()

            this.isInitialized = true
            logger.success(`Dreamina 账户管理器初始化完成，共加载 ${this.dreaminaAccounts.length} 个账户`, 'DREAMINA')
        } catch (error) {
            logger.error('Dreamina 账户管理器初始化失败', 'DREAMINA', '', error)
        }
    }

    _setupDailyRefresh() {
        try {
            const timeStr = config.dailySessionUpdateTime
            if (!timeStr) {
                logger.info('未配置 DAILY_SESSION_UPDATE_TIME，跳过每日刷新调度', 'SCHEDULE')
                return
            }

            const [hStr, mStr] = timeStr.split(':')
            const hour = Number(hStr)
            const minute = Number(mStr)
            if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
                logger.warn(`无效的 DAILY_SESSION_UPDATE_TIME: ${timeStr}，期望 HH:mm（24小时制）`, 'SCHEDULE')
                return
            }

            // 清理旧定时器
            if (this._dailyTimer) clearInterval(this._dailyTimer)

            // 每分钟检查一次目标时区时间
            this._dailyTimer = setInterval(() => this._checkDailyRefresh(hour, minute), 60 * 1000)
            logger.info(`已启用每日刷新调度：${timeStr} @ ${config.timeZone || 'UTC'}`, 'SCHEDULE', '⏰')
        } catch (e) {
            logger.error('每日刷新调度初始化失败', 'SCHEDULE', '', e)
        }
    }

    _getNowInTimezoneParts() {
        const tz = config.timeZone || 'UTC'
        try {
            const fmt = new Intl.DateTimeFormat('en-CA', {
                timeZone: tz,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            })
            const parts = fmt.formatToParts(new Date())
            const map = {}
            for (const p of parts) map[p.type] = p.value
            return {
                year: map.year,
                month: map.month,
                day: map.day,
                hour: map.hour,
                minute: map.minute,
                dateStr: `${map.year}-${map.month}-${map.day}`
            }
        } catch (e) {
            // 回退到本地时间
            const now = new Date()
            const y = String(now.getFullYear())
            const mo = String(now.getMonth() + 1).padStart(2, '0')
            const d = String(now.getDate()).padStart(2, '0')
            const h = String(now.getHours()).padStart(2, '0')
            const mi = String(now.getMinutes()).padStart(2, '0')
            logger.warn(`无效的 TIMEZONE: ${config.timeZone}，已回退为本地时区`, 'SCHEDULE')
            return { year: y, month: mo, day: d, hour: h, minute: mi, dateStr: `${y}-${mo}-${d}` }
        }
    }

    async _checkDailyRefresh(targetHour, targetMinute) {
        try {
            if (!this.isInitialized) return
            const now = this._getNowInTimezoneParts()
            if (Number(now.hour) === targetHour && Number(now.minute) === targetMinute) {
                if (this._lastDailyRunDate === now.dateStr) return

                this._lastDailyRunDate = now.dateStr
                logger.info(`触发每日 SessionID 批量刷新（全部账户）`, 'SCHEDULE', '🔁', { date: now.dateStr, time: `${now.hour}:${now.minute}`, tz: config.timeZone })
                // 刷新全部账户（用超大阈值确保覆盖）
                try {
                    const count = await this.autoRefreshSessionIds(8760)
                    logger.success(`每日批量刷新完成，成功数量：${count}`, 'SCHEDULE')
                } catch (err) {
                    logger.error('每日批量刷新执行失败', 'SCHEDULE', '', err)
                }
            }
        } catch (e) {
            logger.error('每日刷新检查异常', 'SCHEDULE', '', e)
        }
    }

    async loadAccounts() {
        try {
            const allAccounts = await this.dataPersistence.loadAccounts()
            this.dreaminaAccounts = allAccounts.filter(account => account.sessionid || account.sessionid_expires)
            
            if (this.dreaminaAccounts.length === 0) {
                this.dreaminaAccounts = []
            }
            
            await this._validateAndCleanSessionIds()
            
            logger.success(`成功加载 ${this.dreaminaAccounts.length} 个 Dreamina 账户`, 'DREAMINA')
        } catch (error) {
            logger.error('加载 Dreamina 账户失败', 'DREAMINA', '', error)
            this.dreaminaAccounts = []
        }
    }

    async _validateAndCleanSessionIds() {
        const validAccounts = []
        
        for (const account of this.dreaminaAccounts) {
            if (account.sessionid && this.tokenManager.validateSessionId(account.sessionid, account.sessionid_expires)) {
                validAccounts.push(account)
            } else if (account.email && account.password) {
                logger.info(`SessionID 无效，尝试重新登录: ${account.email}`, 'DREAMINA', '🔄')
                const result = await this.tokenManager.login(account.email, account.password)
                if (result) {
                    account.sessionid = result.sessionid
                    account.sessionid_expires = result.expires
                    validAccounts.push(account)
                }
            }
        }
        
        this.dreaminaAccounts = validAccounts
    }

    async autoRefreshSessionIds(thresholdHours = 24) {
        if (!this.isInitialized) {
            logger.warn('Dreamina 账户管理器尚未初始化，跳过自动刷新', 'DREAMINA')
            return 0
        }
        
        logger.info('开始自动刷新 Dreamina SessionID...', 'DREAMINA', '🔄')
        
        const needsRefresh = this.dreaminaAccounts.filter(account =>
            this.tokenManager.isSessionIdExpiringSoon(account.sessionid_expires, thresholdHours)
        )
        
        if (needsRefresh.length === 0) {
            logger.info('没有需要刷新的 SessionID', 'DREAMINA')
            return 0
        }
        
        logger.info(`发现 ${needsRefresh.length} 个 SessionID 需要刷新`, 'DREAMINA')
        
        let successCount = 0
        let failedCount = 0
        
        for (const account of needsRefresh) {
            try {
                const updatedAccount = await this.tokenManager.refreshSessionId(account)
                if (updatedAccount) {
                    const index = this.dreaminaAccounts.findIndex(acc => acc.email === account.email)
                    if (index !== -1) {
                        this.dreaminaAccounts[index] = updatedAccount
                    }
                    
                    await this.dataPersistence.saveAccount(account.email, {
                        password: updatedAccount.password,
                        token: updatedAccount.token,
                        expires: updatedAccount.expires,
                        sessionid: updatedAccount.sessionid,
                        sessionid_expires: updatedAccount.sessionid_expires
                    })
                    
                    successCount++
                    logger.info(`账户 ${account.email} SessionID 刷新并保存成功 (${successCount}/${needsRefresh.length})`, 'DREAMINA', '✅')
                } else {
                    failedCount++
                    logger.error(`账户 ${account.email} SessionID 刷新失败 (${failedCount} 个失败)`, 'DREAMINA', '❌')
                }
            } catch (error) {
                failedCount++
                logger.error(`账户 ${account.email} 刷新过程中出错`, 'DREAMINA', '', error)
            }
            
            await this._delay(2000)
        }
        
        logger.success(`SessionID 刷新完成: 成功 ${successCount} 个，失败 ${failedCount} 个`, 'DREAMINA')
        return successCount
    }

    async addAccount(email, password) {
        try {
            const existingAccount = this.dreaminaAccounts.find(acc => acc.email === email)
            if (existingAccount) {
                logger.warn(`Dreamina 账户 ${email} 已存在`, 'DREAMINA')
                return false
            }
            
            const result = await this.tokenManager.login(email, password)
            if (!result) {
                logger.error(`Dreamina 账户 ${email} 登录失败，无法添加`, 'DREAMINA')
                return false
            }
            
            const newAccount = {
                email,
                password,
                sessionid: result.sessionid,
                sessionid_expires: result.expires
            }
            
            this.dreaminaAccounts.push(newAccount)
            
            await this.dataPersistence.saveAccount(email, newAccount)
            
            logger.success(`成功添加 Dreamina 账户: ${email}`, 'DREAMINA')
            return true
        } catch (error) {
            logger.error(`添加 Dreamina 账户失败 (${email})`, 'DREAMINA', '', error)
            return false
        }
    }

    async removeAccount(email) {
        try {
            const index = this.dreaminaAccounts.findIndex(acc => acc.email === email)
            if (index === -1) {
                logger.warn(`Dreamina 账户 ${email} 不存在`, 'DREAMINA')
                return false
            }
            
            this.dreaminaAccounts.splice(index, 1)
            
            logger.success(`成功移除 Dreamina 账户: ${email}`, 'DREAMINA')
            return true
        } catch (error) {
            logger.error(`移除 Dreamina 账户失败 (${email})`, 'DREAMINA', '', error)
            return false
        }
    }

    async refreshAccount(email) {
        const account = this.dreaminaAccounts.find(acc => acc.email === email)
        if (!account) {
            logger.error(`未找到邮箱为 ${email} 的 Dreamina 账户`, 'DREAMINA')
            return false
        }
        
        const updatedAccount = await this.tokenManager.refreshSessionId(account)
        if (updatedAccount) {
            const index = this.dreaminaAccounts.findIndex(acc => acc.email === email)
            if (index !== -1) {
                this.dreaminaAccounts[index] = updatedAccount
            }
            
            await this.dataPersistence.saveAccount(email, {
                password: updatedAccount.password,
                token: updatedAccount.token,
                expires: updatedAccount.expires,
                sessionid: updatedAccount.sessionid,
                sessionid_expires: updatedAccount.sessionid_expires
            })
            
            return true
        }
        
        return false
    }

    getAllAccounts() {
        return this.dreaminaAccounts
    }

    getHealthStats() {
        const sessionIdStats = this.tokenManager.getSessionIdHealthStats(this.dreaminaAccounts)
        
        return {
            accounts: sessionIdStats,
            initialized: this.isInitialized
        }
    }

    async _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    destroy() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval)
            this.refreshInterval = null
        }
        if (this._dailyTimer) {
            clearInterval(this._dailyTimer)
            this._dailyTimer = null
        }
        
        logger.info('Dreamina 账户管理器已清理资源', 'DREAMINA', '🧹')
    }
}

const dreaminaAccountManager = new DreaminaAccount()

process.on('exit', () => {
    if (dreaminaAccountManager) {
        dreaminaAccountManager.destroy()
    }
})

process.on('SIGINT', () => {
    if (dreaminaAccountManager) {
        dreaminaAccountManager.destroy()
    }
    process.exit(0)
})

module.exports = dreaminaAccountManager
