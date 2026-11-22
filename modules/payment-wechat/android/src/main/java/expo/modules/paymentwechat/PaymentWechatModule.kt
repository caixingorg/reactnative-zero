package expo.modules.paymentwechat

import com.tencent.mm.opensdk.modelpay.PayReq
import com.tencent.mm.opensdk.openapi.WXAPIFactory
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PaymentWechatModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PaymentWechat")

    AsyncFunction("registerApp") { appId: String, _: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val api = WXAPIFactory.createWXAPI(context, appId, false)
      val registered = api.registerApp(appId)
      WechatPayCallbackRegistry.api = api
      registered
    }

    AsyncFunction("isWXAppInstalled") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val api = WechatPayCallbackRegistry.api ?: WXAPIFactory.createWXAPI(context, null)
      api.isWXAppInstalled
    }

    AsyncFunction("pay") { params: Map<String, String>, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("NO_CONTEXT", "Android React context is unavailable.", null)
        return@AsyncFunction
      }

      val appId = params["appId"] ?: ""
      val api = WechatPayCallbackRegistry.api ?: WXAPIFactory.createWXAPI(context, appId, false).also {
        it.registerApp(appId)
        WechatPayCallbackRegistry.api = it
      }

      if (!api.isWXAppInstalled) {
        promise.resolve(mapOf("errCode" to -99, "errStr" to "WeChat app is not installed."))
        return@AsyncFunction
      }

      val req = PayReq().apply {
        this.appId = appId
        this.partnerId = params["partnerId"] ?: ""
        this.prepayId = params["prepayId"] ?: ""
        this.packageValue = params["packageValue"] ?: "Sign=WXPay"
        this.nonceStr = params["nonceStr"] ?: ""
        this.timeStamp = params["timeStamp"] ?: ""
        this.sign = params["sign"] ?: ""
      }

      WechatPayCallbackRegistry.setPending(promise)
      val sent = api.sendReq(req)
      if (!sent) {
        promise.resolve(mapOf("errCode" to -1, "errStr" to "Failed to launch WeChat Pay."))
      }
    }
  }
}
