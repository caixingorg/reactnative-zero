import ExpoModulesCore
import AlipaySDK

internal final class AlipayCallbackBridge {
  static let shared = AlipayCallbackBridge()
  private var pendingPromise: Promise?

  func setPending(_ promise: Promise) {
    pendingPromise = promise
  }

  func resolveIfPending(_ resultDic: [AnyHashable: Any]?) {
    guard let promise = pendingPromise else { return }
    pendingPromise = nil
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
        AlipayCallbackBridge.shared.setPending(promise)
        AlipaySDK.defaultService().payOrder(orderInfo, fromScheme: scheme) { resultDic in
          AlipayCallbackBridge.shared.resolveIfPending(resultDic)
        }
      }
    }
  }
}
