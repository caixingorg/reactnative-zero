import ExpoModulesCore
import AlipaySDK

internal final class AlipayCallbackBridge {
  static let shared = AlipayCallbackBridge()
  private let lock = NSLock()
  private var pendingPromise: Promise?

  func setPending(_ promise: Promise) {
    lock.lock()
    let previous = pendingPromise
    pendingPromise = promise
    lock.unlock()

    previous?.resolve([
      "resultStatus": "6001",
      "result": "",
      "memo": "Superseded by a new Alipay payment request.",
    ])
  }

  func resolveIfPending(_ resultDic: [AnyHashable: Any]?) {
    lock.lock()
    let promise = pendingPromise
    pendingPromise = nil
    lock.unlock()

    guard let promise else { return }
    let status = resultDic?["resultStatus"] as? String ?? ""
    let result = resultDic?["result"] as? String ?? ""
    let memo = resultDic?["memo"] as? String ?? ""
    promise.resolve([
      "resultStatus": status,
      "result": result,
      "memo": memo,
    ])
  }
}

public class PaymentAlipayModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PaymentAlipay")

    AsyncFunction("pay") { (orderInfo: String, scheme: String, promise: Promise) in
      DispatchQueue.main.async {
        guard let alipaySDK = AlipaySDK.defaultService() else {
          promise.reject("ALIPAY_SDK_UNAVAILABLE", "AlipaySDK.defaultService() is unavailable.")
          return
        }
        AlipayCallbackBridge.shared.setPending(promise)
        alipaySDK.payOrder(orderInfo, fromScheme: scheme) { resultDic in
          AlipayCallbackBridge.shared.resolveIfPending(resultDic)
        }
      }
    }
  }
}
