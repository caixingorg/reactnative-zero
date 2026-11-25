package expo.modules.paymentwechat

import android.content.Context
import com.tencent.mm.opensdk.modelpay.PayReq
import com.tencent.mm.opensdk.openapi.WXAPIFactory
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PaymentWechatModule : Module() {
  private fun applicationContextOrNull(): Context? {
    return try {
      appContext.applicationContext
    } catch (_: IllegalArgumentException) {
      null
    } catch (_: IllegalStateException) {
      null
    }
  }

  override fun definition() = ModuleDefinition {
    Name("PaymentWechat")

    AsyncFunction("registerApp") { appId: String, _: String ->
      val context = applicationContextOrNull() ?: return@AsyncFunction false
      val api = WXAPIFactory.createWXAPI(context, appId, false)
      val registered = api.registerApp(appId)
      WechatPayCallbackRegistry.setApi(api)
      registered
    }

    AsyncFunction("isWXAppInstalled") {
      val context = applicationContextOrNull() ?: return@AsyncFunction false
      val api = WechatPayCallbackRegistry.api ?: WXAPIFactory.createWXAPI(context, null)
      api.isWXAppInstalled
    }

    AsyncFunction("pay") { params: Map<String, String>, promise: Promise ->
      val context = applicationContextOrNull()
      if (context == null) {
        promise.reject("NO_CONTEXT", "Android application context is unavailable.", null)
        return@AsyncFunction
      }

      val appId = params["appId"] ?: ""
      val api = WechatPayCallbackRegistry.getOrCreateApi(context, appId)

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
      val sent = try {
        api.sendReq(req)
      } catch (_: Throwable) {
        false
      }
      if (!sent) {
        WechatPayCallbackRegistry.resolveFailureIfPending(promise)
      }
    }
  }
}
