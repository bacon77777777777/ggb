import Foundation
import Capacitor
import LineSDK

/**
 * 吉吉比原生 LINE 登入
 *
 * 走 LINE SDK 的 app-to-app 授權：裝了 LINE 的手機直接切到 LINE App 按「允許」
 * 就回來，全程沒有瀏覽器、沒有中繼頁、沒有「要打開吉吉比嗎」；
 * 沒裝 LINE 的手機 SDK 自動退回內嵌網頁授權，一樣不離開 App。
 *
 * 回傳 accessToken 給前台，前台交給後端驗：
 * 後端拿它打 LINE 的 verify（比對 client_id）＋ profile 端點拿 userId ——
 * 跟舊的 id_token 驗法同一個信任等級，都不信前端自報的身份。
 *
 * channelId 來自 capacitor.config.ts 的 plugins.LineLogin.channelId。
 */
@objc(LineLoginPlugin)
public class LineLoginPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LineLoginPlugin"
    public let jsName = "LineLogin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "login", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        guard let channelId = getConfig().getString("channelId"), !channelId.isEmpty else {
            CAPLog.print("[LineLogin] capacitor.config 缺 plugins.LineLogin.channelId，外掛停用")
            return
        }
        LoginManager.shared.setup(channelID: channelId, universalLinkURL: nil)

        /*
         * LINE App 授權完是用 line3rdp.<bundle id> 這個 scheme 把人帶回來的，
         * SDK 需要收到那個 openURL 才能完成流程。Capacitor 收到 openURL 時會
         * 廣播 capacitorOpenURL，掛在這裡就不用動 AppDelegate。
         */
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleOpenUrl(_:)),
            name: Notification.Name.capacitorOpenURL,
            object: nil
        )
    }

    @objc private func handleOpenUrl(_ notification: Notification) {
        guard let object = notification.object as? [String: Any],
              let url = object["url"] as? URL else { return }
        _ = LoginManager.shared.application(UIApplication.shared, open: url)
    }

    @objc public func login(_ call: CAPPluginCall) {
        guard LoginManager.shared.isSetupFinished else {
            call.reject("LINE 登入尚未設定")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let viewController = self?.bridge?.viewController else {
                call.reject("找不到畫面")
                return
            }
            // 已有進行中的授權（連點兩下）就先收掉，不然 SDK 會直接噴錯
            if LoginManager.shared.isAuthorizing {
                call.reject("授權進行中")
                return
            }
            LoginManager.shared.login(permissions: [.profile, .openID], in: viewController) { result in
                switch result {
                case .success(let login):
                    call.resolve([
                        "accessToken": login.accessToken.value,
                        "displayName": login.userProfile?.displayName ?? "",
                        "pictureUrl": login.userProfile?.pictureURL?.absoluteString ?? "",
                    ])
                case .failure(let error):
                    if case .generalError(reason: .processDiscarded) = error {
                        call.reject("cancelled", "USER_CANCELLED")
                    } else {
                        call.reject(error.localizedDescription)
                    }
                }
            }
        }
    }
}
