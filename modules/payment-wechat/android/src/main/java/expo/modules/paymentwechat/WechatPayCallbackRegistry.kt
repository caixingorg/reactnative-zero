package expo.modules.paymentwechat

import android.content.Context
import com.tencent.mm.opensdk.modelbase.BaseResp
import com.tencent.mm.opensdk.openapi.IWXAPI
import com.tencent.mm.opensdk.openapi.WXAPIFactory
import expo.modules.kotlin.Promise

object WechatPayCallbackRegistry {
  private val lock = Any()

  @Volatile
  var api: IWXAPI? = null

  @Volatile
  private var pendingPromise: Promise? = null

  fun getOrCreateApi(context: Context, appId: String): IWXAPI {
    val appCtx = context.applicationContext
    synchronized(lock) {
      api?.let { return it }
      return WXAPIFactory.createWXAPI(appCtx, appId, false).also {
        it.registerApp(appId)
        api = it
      }
    }
  }

  fun setApi(newApi: IWXAPI) {
    synchronized(lock) {
      api = newApi
    }
  }

  fun setPending(promise: Promise) {
    val previous = synchronized(lock) {
      val prev = pendingPromise
      pendingPromise = promise
      prev
    }
    previous?.resolve(
      mapOf(
        "errCode" to -2,
        "errStr" to "Superseded by a new WeChat Pay request.",
      ),
    )
  }

  fun resolveFailureIfPending(
    promise: Promise,
    errCode: Int = -1,
    errStr: String = "Failed to launch WeChat Pay.",
  ) {
    val target = synchronized(lock) {
      if (pendingPromise === promise) {
        pendingPromise = null
        promise
      } else {
        null
      }
    }
    target?.resolve(
      mapOf(
        "errCode" to errCode,
        "errStr" to errStr,
      ),
    )
  }

  fun resolveResp(resp: BaseResp) {
    val promise = synchronized(lock) {
      val current = pendingPromise ?: return
      pendingPromise = null
      current
    }
    promise.resolve(
      mapOf(
        "errCode" to resp.errCode,
        "errStr" to (resp.errStr ?: ""),
      ),
    )
  }
}
