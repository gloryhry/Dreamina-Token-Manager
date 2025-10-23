const { chromium } = require('playwright')
const { logger } = require('./logger')

class DreaminaTokenManager {
  constructor() {
    this.loginUrl = 'https://dreamina.capcut.com/ai-tool/home'
    this.defaultTimeout = 30000
  }

  async login(email, password) {
    let browser = null
    let context = null
    
    try {
      logger.info(`开始登录 Dreamina 账户: ${email}`, 'DREAMINA')
      
      browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--incognito']
      })
      
      context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      })
      
      const page = await context.newPage()
      
      await page.goto(this.loginUrl, { waitUntil: 'networkidle', timeout: 60000 })
      await this._delay(500)
      
      const screenshotPath = 'screenshot-disabled'
      // screenshot disabled: removed page.screenshot
      // logger.info(`页面截图已保存: ${screenshotPath}`, 'DREAMINA')
      logger.info(`页面标题: ${await page.title()}`, 'DREAMINA')
      
      logger.info('步骤1: 查找并点击 Create 菜单项...', 'DREAMINA')
      await page.waitForTimeout(3000)
      
      // 先尝试点击 Create 菜单项
      const createSelectors = [
        'div[role="menuitem"]:has-text("Create")',
        'div.lv-menu-item:has-text("Create")',
        'div#AIGeneratedRecord:has-text("Create")'
      ]
      
      let createBtn = null
      for (const selector of createSelectors) {
        try {
          const btn = page.locator(selector).first()
          const count = await btn.count()
          logger.info(`尝试 Create 选择器: ${selector}, 找到 ${count} 个元素`, 'DREAMINA')
          if (count > 0) {
            const isVisible = await btn.isVisible().catch(() => false)
            logger.info(`Create 选择器 ${selector} 可见性: ${isVisible}`, 'DREAMINA')
            if (isVisible) {
              logger.info(`找到 Create 按钮，使用选择器: ${selector}`, 'DREAMINA')
              createBtn = btn
              break
            }
          }
        } catch (e) {
          logger.info(`Create 选择器 ${selector} 出错: ${e.message}`, 'DREAMINA')
          continue
        }
      }
      
      if (createBtn) {
        await createBtn.click({ timeout: 10000 })
        await this._delay(1000)
        logger.info('已点击 Create 菜单项，继续查找登录入口', 'DREAMINA')
      } else {
        logger.info('没有找到 Create 菜单项，尝试点击 Sign in 按钮', 'DREAMINA')
        
        // 尝试点击 Sign in 按钮
        const signInSelectors = [
          'button:has-text("Sign in")',
          'a:has-text("Sign in")',
          'div[role="menuitem"]:has-text("Sign in")',
          '#SiderMenuLogin',
          '[class*="login"]',
          'div:has-text("Sign in")',
          'span:has-text("Sign in")'
        ]
        
        let signInBtn = null
        for (const selector of signInSelectors) {
          try {
            const btn = page.locator(selector).first()
            const count = await btn.count()
            logger.info(`尝试 Sign in 选择器: ${selector}, 找到 ${count} 个元素`, 'DREAMINA')
            if (count > 0) {
              const isVisible = await btn.isVisible().catch(() => false)
              logger.info(`Sign in 选择器 ${selector} 可见性: ${isVisible}`, 'DREAMINA')
              if (isVisible) {
                logger.info(`找到 Sign in 按钮，使用选择器: ${selector}`, 'DREAMINA')
                signInBtn = btn
                break
              }
            }
          } catch (e) {
            logger.info(`Sign in 选择器 ${selector} 出错: ${e.message}`, 'DREAMINA')
            continue
          }
        }
        
        if (signInBtn) {
          await signInBtn.click({ timeout: 10000 })
          await this._delay(500)
        } else {
          const buttons = await page.locator('button').allTextContents()
          const links = await page.locator('a').allTextContents()
          const divs = await page.locator('div[role="menuitem"]').allTextContents()
          logger.info(`页面上的按钮: ${buttons.join(', ')}`, 'DREAMINA')
          logger.info(`页面上的链接: ${links.join(', ')}`, 'DREAMINA')
          logger.info(`页面上的菜单项: ${divs.join(', ')}`, 'DREAMINA')
          throw new Error('无法找到 Create 菜单项或 Sign in 按钮')
        }
      }
      
      logger.info('步骤2: 点击 Continue with email...', 'DREAMINA')
      const emailSelectors = [
        'span.lv_new_third_part_sign_in_expand-label:has-text("Continue with email")',
        'text=Continue with email',
        '[class*="sign_in_expand-label"]'
      ]
      
      let continueEmail = null
      for (const selector of emailSelectors) {
        try {
          const btn = page.locator(selector).first()
          if (await btn.count() > 0 && await btn.isVisible()) {
            logger.info(`找到 Continue with email，使用选择器: ${selector}`, 'DREAMINA')
            continueEmail = btn
            break
          }
        } catch (e) {
          continue
        }
      }
      
      if (!continueEmail) {
        // await this._delay(500000)
        throw new Error('无法找到 Continue with email 按钮')
      }
      
      await continueEmail.click({ timeout: 10000 })
      await this._delay(500)
      
      logger.info('步骤3: 填入邮箱地址...', 'DREAMINA')
      const emailInputSelectors = [
        'input[placeholder="Enter email"]',
        'input[autocomplete="on"][placeholder*="email"]',
        'input[type="email"]'
      ]
      
      let emailInput = null
      for (const selector of emailInputSelectors) {
        try {
          const input = page.locator(selector).first()
          if (await input.count() > 0 && await input.isVisible()) {
            logger.info(`找到邮箱输入框，使用选择器: ${selector}`, 'DREAMINA')
            emailInput = input
            break
          }
        } catch (e) {
          continue
        }
      }
      
      if (!emailInput) {
        throw new Error('无法找到邮箱输入框')
      }
      
      await emailInput.fill(email)
      await this._delay(500)
      
      logger.info('步骤4: 填入密码...', 'DREAMINA')
      const passwordInputSelectors = [
        'input.lv-input.lv-input-size-default[type="password"][placeholder="Enter password"]',
        'input[type="password"][placeholder="Enter password"]',
        'input[type="password"]'
      ]
      
      let passwordInput = null
      for (const selector of passwordInputSelectors) {
        try {
          const input = page.locator(selector).first()
          if (await input.count() > 0 && await input.isVisible()) {
            logger.info(`找到密码输入框，使用选择器: ${selector}`, 'DREAMINA')
            passwordInput = input
            break
          }
        } catch (e) {
          continue
        }
      }
      
      if (!passwordInput) {
        throw new Error('无法找到密码输入框')
      }
      
      await passwordInput.fill(password)
      await this._delay(500)
      
      logger.info('步骤5: 点击 Continue 按钮...', 'DREAMINA')
      const continueBtnSelectors = [
        'button:has-text("Continue")',
        'button.lv-btn-primary:has-text("Continue")',
        'button.lv-btn.lv-btn-primary.lv-btn-size-large.lv_new_sign_in_panel_wide-sign-in-button:has-text("Continue")'
      ]
      
      let continueBtn = null
      for (const selector of continueBtnSelectors) {
        try {
          const btn = page.locator(selector).first()
          if (await btn.count() > 0 && await btn.isVisible()) {
            logger.info(`找到 Continue 按钮，使用选择器: ${selector}`, 'DREAMINA')
            continueBtn = btn
            break
          }
        } catch (e) {
          continue
        }
      }
      
      if (!continueBtn) {
        throw new Error('无法找到 Continue 按钮')
      }
      
      await continueBtn.click({ timeout: 10000 })
      
      logger.info('步骤6: 等待页面跳转...', 'DREAMINA')
      try {
        await page.waitForURL('**/dreamina.capcut.com/**', { timeout: 30000 })
        logger.info(`页面已跳转到: ${page.url()}`, 'DREAMINA')
      } catch (e) {
        logger.info(`等待URL超时，当前URL: ${page.url()}`, 'DREAMINA')
        const errorText = await page.locator('.lv-message, .error, [class*="error"]').allTextContents()
        if (errorText.length > 0) {
          logger.info(`页面错误信息: ${errorText.join(', ')}`, 'DREAMINA')
        }
        await page.waitForLoadState('networkidle', { timeout: 10000 })
      }
      await this._delay(10000)
      
      // const finalScreenshot = 'screenshot-disabled'
      // screenshot disabled: removed page.screenshot
      // logger.info(`最终页面截图: ${finalScreenshot}`, 'DREAMINA')
      
      logger.info('步骤7: 获取 Cookie 中的 sessionid...', 'DREAMINA')
      const cookies = await context.cookies()
      logger.info(`获取到 ${cookies.length} 个 Cookie`, 'DREAMINA')
      logger.info(`所有 Cookie: ${cookies.map(c => c.name).join(', ')}`, 'DREAMINA')
      
      const sessionidCookie = cookies.find(cookie => cookie.name === 'sessionid')
      
      if (!sessionidCookie) {
        logger.info(`所有 Cookie 详情: ${JSON.stringify(cookies.map(c => ({name: c.name, domain: c.domain, value: c.value.substring(0, 30)})), null, 2)}`, 'DREAMINA')
        throw new Error('未找到 sessionid Cookie，可能是登录失败或账号密码错误')
      }
      
      const sessionid = sessionidCookie.value
      const expires = sessionidCookie.expires || Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
      logger.info(`找到 Cookie: ${sessionidCookie.name}`, 'DREAMINA')
      logger.info('${sessionidCookie.name} expires in {expires}')
      logger.success(`${email} 登录成功，获取到 sessionid`, 'DREAMINA')
      
      return {
        sessionid,
        expires
      }
      
    } catch (error) {
      logger.error(`${email} 登录失败`, 'DREAMINA', '', error)
      return null
    } finally {
      if (context) await context.close()
      if (browser) await browser.close()
    }
  }

  validateSessionId(sessionid, expires) {
    try {
      if (!sessionid) return false
      
      const now = Math.floor(Date.now() / 1000)
      if (expires && expires <= now) {
        return false
      }
      
      return true
    } catch (error) {
      logger.error('SessionID 验证失败', 'DREAMINA', '', error)
      return false
    }
  }

  isSessionIdExpiringSoon(expires, thresholdHours = 24) {
    if (!expires) return true
    
    const now = Math.floor(Date.now() / 1000)
    const thresholdSeconds = thresholdHours * 60 * 60
    return expires - now < thresholdSeconds
  }

  getSessionIdRemainingHours(expires) {
    if (!expires) return -1
    
    const now = Math.floor(Date.now() / 1000)
    const remainingSeconds = expires - now
    return Math.max(0, Math.round(remainingSeconds / 3600))
  }

  async refreshSessionId(account) {
    try {
      const result = await this.login(account.email, account.password)
      if (!result) {
        return null
      }
      
      const updatedAccount = {
        ...account,
        sessionid: result.sessionid,
        sessionid_expires: result.expires
      }
      
      const remainingHours = this.getSessionIdRemainingHours(result.expires)
      logger.success(`SessionID 刷新成功: ${account.email} (有效期: ${remainingHours}小时)`, 'DREAMINA')
      
      return updatedAccount
    } catch (error) {
      logger.error(`刷新 SessionID 失败 (${account.email})`, 'DREAMINA', '', error)
      return null
    }
  }

  async batchRefreshSessionIds(accounts, thresholdHours = 24, onEachRefresh = null) {
    const needsRefresh = accounts.filter(account =>
      this.isSessionIdExpiringSoon(account.sessionid_expires, thresholdHours)
    )
    
    if (needsRefresh.length === 0) {
      logger.info('没有需要刷新的 SessionID', 'DREAMINA')
      return { refreshed: [], failed: [] }
    }
    
    logger.info(`发现 ${needsRefresh.length} 个 SessionID 需要刷新`, 'DREAMINA')
    
    const refreshed = []
    const failed = []
    
    for (let i = 0; i < needsRefresh.length; i++) {
      const account = needsRefresh[i]
      const updatedAccount = await this.refreshSessionId(account)
      
      if (updatedAccount) {
        refreshed.push(updatedAccount)
        
        if (onEachRefresh && typeof onEachRefresh === 'function') {
          try {
            await onEachRefresh(updatedAccount, i + 1, needsRefresh.length)
          } catch (error) {
            logger.error(`刷新回调函数执行失败 (${account.email})`, 'DREAMINA', '', error)
          }
        }
      } else {
        failed.push(account)
      }
      
      await this._delay(2000)
    }
    
    logger.success(`SessionID 刷新完成: 成功 ${refreshed.length} 个，失败 ${failed.length} 个`, 'DREAMINA')
    return { refreshed, failed }
  }

  getSessionIdHealthStats(accounts) {
    const stats = {
      total: accounts.length,
      valid: 0,
      expired: 0,
      expiringSoon: 0,
      invalid: 0
    }
    
    accounts.forEach(account => {
      if (!account.sessionid) {
        stats.invalid++
        return
      }
      
      if (!this.validateSessionId(account.sessionid, account.sessionid_expires)) {
        stats.invalid++
        return
      }
      
      const now = Math.floor(Date.now() / 1000)
      if (account.sessionid_expires && account.sessionid_expires <= now) {
        stats.expired++
      } else if (this.isSessionIdExpiringSoon(account.sessionid_expires, 24)) {
        stats.expiringSoon++
      } else {
        stats.valid++
      }
    })
    
    return stats
  }

  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

module.exports = DreaminaTokenManager
