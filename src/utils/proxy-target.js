const config = require('../config')

let runtimeProxyTarget = process.env.PROXY_TARGET || ''

const getProxyTarget = () => runtimeProxyTarget || config.proxyTarget || ''

const setProxyTarget = (url) => {
  runtimeProxyTarget = url || ''
  return runtimeProxyTarget
}

module.exports = {
  getProxyTarget,
  setProxyTarget
}

