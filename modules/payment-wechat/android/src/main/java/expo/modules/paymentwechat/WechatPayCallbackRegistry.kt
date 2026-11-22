package expo.modules.paymentwechat

import com.tencent.mm.opensdk.modelbase.BaseResp
import com.tencent.mm.opensdk.openapi.IWXAPI
import expo.modules.kotlin.Promise

object WechatPayCallbackRegistry {
  @Volatile
  var api: IWXAPI? = null

  @Volatile
  private var pendingPromise: Promise? = null

  fun setPending(promise: Promise) {
    pendingPromise = promise
  }

  fun resolveResp(resp: BaseResp) {
    val promise = pendingPromise ?: return
    pendingPromise = null
    promise.resolve(
      mapOf(
        "errCode" to resp.errCode,
        "errStr" to (resp.errStr ?: ""),
      ),
    )
  }
}
