import ExpoModulesCore
import WechatOpenSDK

internal final class WechatPayDelegateBridge: NSObject, WXApiDelegate {
  static let shared = WechatPayDelegateBridge()
  private var pendingPromise: Promise?

  func setPending(_ promise: Promise) {
    pendingPromise = promise
  }

  func onResp(_ resp: BaseResp) {
    guard let promise = pendingPromise else { return }
    pendingPromise = nil
    promise.resolve([
      "errCode": resp.errCode,
      "errStr": resp.errStr,
    ])
  }
}

public class PaymentWechatModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PaymentWechat")

    AsyncFunction("registerApp") { (appId: String, universalLink: String) -> Bool in
      WXApi.registerApp(appId, universalLink: universalLink)
    }

    AsyncFunction("isWXAppInstalled") { () -> Bool in
      WXApi.isWXAppInstalled()
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

        WechatPayDelegateBridge.shared.setPending(promise)
        WXApi.send(req) { success in
          if !success {
            promise.resolve(["errCode": -1, "errStr": "Failed to launch WeChat Pay."])
          }
        }
      }
    }
  }
}
