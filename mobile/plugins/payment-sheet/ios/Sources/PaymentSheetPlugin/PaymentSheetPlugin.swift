import Foundation
import Capacitor
import WebKit
import UIKit

/**
 * 吉吉比原生付款小卡
 *
 * 為什麼不用 SFSafariViewController（@capacitor/browser）：
 * 它上下各一條系統工具列（網址、上下頁、分享…），付款這種單一任務的流程
 * 看起來又擠又雜（老闆 2026-08-20：「上下都有原生的 bar，體感變差」）。
 * 也不能用 iframe —— 綠界掛 frame-ancestors 'none' 禁止內嵌。
 *
 * 這裡自己 present 一張 pageSheet：頂上只有一條「標題 + ✕」，底下整片是
 * WKWebView。兩個關鍵：
 *
 * 1. **用預設的 WKWebsiteDataStore** —— 跟 Capacitor 主 webview 同一個
 *    cookie 倉，玩家的登入 session 直接就在，什麼票都不用交接。
 * 2. **原生層攔截回程**：導航一碰到 returnPrefix（/payment/return）就取消
 *    載入、收起小卡、把整個網址 resolve 回 JS —— 玩家看不到任何中繼頁，
 *    OTP 轉完小卡就收，前台自己導去儲值紀錄跳提示。
 */
@objc(PaymentSheetPlugin)
public class PaymentSheetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PaymentSheetPlugin"
    public let jsName = "PaymentSheet"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    private weak var currentSheet: PaymentSheetViewController?

    @objc public func open(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("缺少網址")
            return
        }
        let returnPrefix = call.getString("returnPrefix") ?? "/payment/return"
        let sheetTitle = call.getString("title") ?? "安全付款"

        DispatchQueue.main.async { [weak self] in
            guard let self = self, let presenter = self.bridge?.viewController else {
                call.reject("找不到畫面")
                return
            }
            if self.currentSheet != nil {
                call.reject("付款視窗已開啟")
                return
            }
            let sheet = PaymentSheetViewController(url: url, returnPrefix: returnPrefix, sheetTitle: sheetTitle)
            sheet.onFinish = { result in
                switch result {
                case .returned(let returnUrl):
                    call.resolve(["returnUrl": returnUrl.absoluteString])
                case .cancelled:
                    call.resolve(["cancelled": true])
                }
            }
            self.currentSheet = sheet
            presenter.present(sheet, animated: true)
        }
    }
}

final class PaymentSheetViewController: UIViewController, WKNavigationDelegate, WKUIDelegate,
    UIAdaptivePresentationControllerDelegate {

    enum FinishResult {
        case returned(URL)
        case cancelled
    }

    var onFinish: ((FinishResult) -> Void)?

    private let initialUrl: URL
    private let returnPrefix: String
    private let sheetTitle: String
    private var webView: WKWebView!
    private var finished = false

    init(url: URL, returnPrefix: String, sheetTitle: String) {
        self.initialUrl = url
        self.returnPrefix = returnPrefix
        self.sheetTitle = sheetTitle
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .pageSheet
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) 不支援") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        presentationController?.delegate = self

        // ── 標題列：只有標題與 ✕，沒有網址列、沒有工具列 ──
        let header = UIView()
        header.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(header)

        let titleLabel = UILabel()
        titleLabel.text = sheetTitle
        titleLabel.font = .systemFont(ofSize: 16, weight: .heavy)
        titleLabel.textColor = .label
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        header.addSubview(titleLabel)

        let closeButton = UIButton(type: .system)
        let icon = UIImage(
            systemName: "xmark",
            withConfiguration: UIImage.SymbolConfiguration(pointSize: 14, weight: .bold)
        )
        closeButton.setImage(icon, for: .normal)
        closeButton.tintColor = .secondaryLabel
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        header.addSubview(closeButton)

        let divider = UIView()
        divider.backgroundColor = .separator.withAlphaComponent(0.4)
        divider.translatesAutoresizingMaskIntoConstraints = false
        header.addSubview(divider)

        // ── WKWebView：預設 data store＝跟主 webview 共用登入 session ──
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        // 載入中的轉圈（綠界第一頁到達前）
        let spinner = UIActivityIndicatorView(style: .medium)
        spinner.hidesWhenStopped = true
        spinner.startAnimating()
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.tag = 99
        view.addSubview(spinner)

        NSLayoutConstraint.activate([
            header.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            header.heightAnchor.constraint(equalToConstant: 48),

            titleLabel.centerXAnchor.constraint(equalTo: header.centerXAnchor),
            titleLabel.centerYAnchor.constraint(equalTo: header.centerYAnchor),

            closeButton.trailingAnchor.constraint(equalTo: header.trailingAnchor, constant: -8),
            closeButton.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            closeButton.widthAnchor.constraint(equalToConstant: 44),
            closeButton.heightAnchor.constraint(equalToConstant: 44),

            divider.leadingAnchor.constraint(equalTo: header.leadingAnchor),
            divider.trailingAnchor.constraint(equalTo: header.trailingAnchor),
            divider.bottomAnchor.constraint(equalTo: header.bottomAnchor),
            divider.heightAnchor.constraint(equalToConstant: 0.5),

            webView.topAnchor.constraint(equalTo: header.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])

        webView.load(URLRequest(url: initialUrl))
    }

    @objc private func closeTapped() {
        finish(.cancelled)
    }

    /// 玩家往下滑把小卡拉掉
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        guard !finished else { return }
        finished = true
        onFinish?(.cancelled)
    }

    private func finish(_ result: FinishResult) {
        guard !finished else { return }
        finished = true
        dismiss(animated: true) { [weak self] in
            self?.onFinish?(result)
        }
    }

    // ── 回程攔截：碰到 /payment/return 就收卡，不載入任何中繼頁 ──
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if let url = navigationAction.request.url,
           url.scheme?.hasPrefix("http") == true,
           url.path.hasPrefix(returnPrefix) {
            decisionHandler(.cancel)
            finish(.returned(url))
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        (view.viewWithTag(99) as? UIActivityIndicatorView)?.stopAnimating()
    }

    /// target=_blank（綠界條款連結之類）：留在同一個 webview 開，不然會沒反應
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            webView.load(URLRequest(url: url))
        }
        return nil
    }
}
