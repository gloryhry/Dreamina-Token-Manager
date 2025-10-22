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
            
            this.isInitialized = true
            logger.success(`Dreamina 账户管理器初始化完成，共加载 ${this.dreaminaAccounts.length} 个账户`, 'DREAMINA')
        } catch (error) {
            logger.error('Dreamina 账户管理器初始化失败', 'DREAMINA', '', error)
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
