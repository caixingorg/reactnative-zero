/**
 * @module modules/payment-alipay/app.plugin
 * 职责：Expo Config Plugin——为 iOS Info.plist 注入支付宝白名单（alipay、alipayshare），Android queries 已通过模块 AndroidManifest 自动合并。
 */
const { withInfoPlist } = require('expo/config-plugins');

function withAlipay(config) {
  return withInfoPlist(config, (mod) => {
    const queries = new Set(mod.modResults.LSApplicationQueriesSchemes ?? []);
    queries.add('alipay');
    queries.add('alipayshare');
    mod.modResults.LSApplicationQueriesSchemes = Array.from(queries);
    return mod;
  });
}

module.exports = withAlipay;
