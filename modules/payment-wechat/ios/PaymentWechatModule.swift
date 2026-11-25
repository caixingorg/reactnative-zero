import ExpoModulesCore
import WechatOpenSDK

internal final class WechatPayDelegateBridge: NSObject, WXApiDelegate {
  static let shared = WechatPayDelegateBridge()
  private let lock = NSLock()
  private var pendingPromise: Promise?
  private var pendingToken: UInt64 = 0

  @discardableResult
  func setPending(_ promise: Promise) -> UInt64 {
    lock.lock()
    let previous = pendingPromise
    pendingPromise = promise
    pendingToken &+= 1
    let token = pendingToken
    lock.unlock()

    previous?.resolve([
      "errCode": -2,
      "errStr": "Superseded by a new WeChat Pay request.",
    ])
    return token
  }

  func clearAndResolveFailureIfPending(
    token: UInt64,
    errCode: Int32 = -1,
    errStr: String = "Failed to launch WeChat Pay."
  ) {
    lock.lock()
    let target: Promise?
    if pendingToken == token, let current = pendingPromise {
      pendingPromise = nil
      target = current
    } else {
      target = nil
    }
    lock.unlock()

    target?.resolve([
      "errCode": errCode,
      "errStr": errStr,
    ])
  }

  func onResp(_ resp: BaseResp) {
    lock.lock()
    let promise = pendingPromise
    pendingPromise = nil
    lock.unlock()

    guard let promise else { return }
    promise.resolve([
      "errCode": resp.errCode,
      "errStr": resp.errStr,
    ])
  }
}

public class PaymentWechatModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PaymentWechat")

    AsyncFunction("registerApp") { (appId: String, universalLink: String, promise: Promise) in
      DispatchQueue.main.async {
        promise.resolve(WXApi.registerApp(appId, universalLink: universalLink))
      }
    }

    AsyncFunction("isWXAppInstalled") { (promise: Promise) in
      DispatchQueue.main.async {
        promise.resolve(WXApi.isWXAppInstalled())
      }
    }

    AsyncFunction("pay") { (params: [String: String], promise: Promise) in
      DispatchQueue.main.async {
        guard WXApi.isWXAppInstalled() else {
          promise.resolve(["errCode": -99, "errStr": "WeChat app is not installed."])
          return
        }

        let req = PayReq()
        req.partnerId = params["partnerId"] ?? ""
        req.prepayId = params["prepayId"] ?? ""
        req.package = params["packageValue"] ?? "Sign=WXPay"
        req.nonceStr = params["nonceStr"] ?? ""
        req.timeStamp = UInt32(params["timeStamp"] ?? "0") ?? 0
        req.sign = params["sign"] ?? ""

        let token = WechatPayDelegateBridge.shared.setPending(promise)
        WXApi.send(req) { success in
          if !success {
            WechatPayDelegateBridge.shared.clearAndResolveFailureIfPending(token: token)
          }
        }
      }
    }
  }
}
