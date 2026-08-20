import UIKit
import Capacitor
import WebKit

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        armSplashFailsafes()
        return true
    }

    /*
     * 啟動畫面的保險絲（兩道）。
     *
     * capacitor.config.ts 設了 `launchAutoHide: false` —— 啟動畫面不會自己收，
     * 要等網頁準備好了主動呼叫 SplashScreen.hide()。這是為了讓開屏廣告能無縫
     * 接手，中間不讓首頁露臉（見 frontend/components/native/AppSplashAd.tsx）。
     *
     * 代價是「沒有人收它」的情況都會變成 App 看起來當機，兩種都要兜底：
     *
     *   ① 網頁載完了卻沒人呼叫 hide（線上還是舊版前台、或那段程式壞了）
     *      → 從「載入完成」再等 1.5 秒就自己收。
     *        從載完起算而不是從開機起算，因為那才是「網頁有機會呼叫 hide」的
     *        時點 —— 網路慢的時候不會提早收掉、把交接弄破。
     *
     *   ② 網頁根本載不起來（斷網、DNS 掛掉、網站掛了）
     *      → 8 秒絕對收，讓玩家看得到 webview 自己的錯誤頁，
     *        知道是連不上而不是 App 壞了。
     *
     * 新版前台會在網頁載完前就收掉（JS 一跑到就收），兩道保險都只是空跑。
     * 重複收沒有實害。
     */
    private func armSplashFailsafes() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { Self.hideSplash() }
        pollUntilWebViewLoaded()
    }

    /// 每 0.5 秒問一次網頁載完了沒；最多問 20 秒（之後交給上面那道絕對保險）
    private func pollUntilWebViewLoaded(attempt: Int = 0) {
        guard attempt < 40 else { return }

        if let webView = Self.bridgeViewController()?.webView,
           webView.estimatedProgress > 0, !webView.isLoading {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { Self.hideSplash() }
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.pollUntilWebViewLoaded(attempt: attempt + 1)
        }
    }

    private static func bridgeViewController() -> CAPBridgeViewController? {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene else { return nil }
        return scene.windows.first(where: { $0.isKeyWindow })?.rootViewController as? CAPBridgeViewController
    }

    /*
     * 用 perform(selector) 而不是直接呼叫：App target 沒有 import 外掛模組
     * （SPM 的 transitive 依賴不保證看得到），走 ObjC runtime 就不用管模組可見性，
     * 外掛不在時 plugin 為 nil 自然跳過。
     */
    private static func hideSplash() {
        guard let plugin = bridgeViewController()?.bridge?.plugin(withName: "SplashScreen") else { return }
        let call = CAPPluginCall(callbackId: "splash-failsafe",
                                 methodName: "hide",
                                 options: ["fadeOutDuration": 200],
                                 success: { _, _ in },
                                 error: { _ in })
        plugin.perform(NSSelectorFromString("hide:"), with: call)
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}
