import ExpoModulesCore
import WechatOpenSDK

public class WechatAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return WXApi.handleOpen(url, delegate: WechatPayDelegateBridge.shared)
  }

  public func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    return WXApi.handleOpenUniversalLink(userActivity, delegate: WechatPayDelegateBridge.shared)
  }
}
