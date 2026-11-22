import ExpoModulesCore
import AlipaySDK

public class AlipayAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    if url.host == "safepay" {
      AlipaySDK.defaultService().processOrder(withPaymentResult: url) { resultDic in
        AlipayCallbackBridge.shared.resolveIfPending(resultDic)
      }
      return true
    }
    return false
  }
}
