package expo.modules.paymentalipay

import com.alipay.sdk.app.EnvUtils
import com.alipay.sdk.app.PayTask
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException

class PaymentAlipayModule : Module() {
  private val executor = Executors.newSingleThreadExecutor()

  override fun definition() = ModuleDefinition {
    Name("PaymentAlipay")

    // 原因：支付宝 PayTask.payV2 为同步阻塞调用，官方强制要求在子线程执行，否则在主线程会直接抛出异常或卡死 UI
    AsyncFunction("pay") { orderInfo: String, sandbox: Boolean, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("NO_ACTIVITY", "Current Android activity is unavailable.", null)
        return@AsyncFunction
      }

      try {
        executor.execute {
          try {
            EnvUtils.setEnv(if (sandbox) EnvUtils.EnvEnum.SANDBOX else EnvUtils.EnvEnum.ONLINE)
            val payTask = PayTask(activity)
            val rawResult = payTask.payV2(orderInfo, true)
            promise.resolve(
              mapOf(
                "resultStatus" to (rawResult?.get("resultStatus") ?: ""),
                "result" to (rawResult?.get("result") ?: ""),
                "memo" to (rawResult?.get("memo") ?: ""),
              ),
            )
          } catch (err: Throwable) {
            promise.reject("ALIPAY_SDK_ERROR", err.message ?: "Alipay SDK call failed.", err)
          }
        }
      } catch (err: RejectedExecutionException) {
        promise.reject("EXECUTOR_SHUTDOWN", err.message ?: "Alipay payment executor has been shut down.", err)
      }
    }

    OnDestroy {
      executor.shutdownNow()
    }
  }
}
