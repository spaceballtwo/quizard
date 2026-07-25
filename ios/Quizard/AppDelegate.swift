// Quizard iOS — the same single-file app, wrapped like the Mac shell.
// Contract with the web app: inject window.__SAVED_DATA at startup, receive
// the full store as JSON on the 'save' message handler.
import UIKit
import WebKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = WebViewController()
        window?.makeKeyAndVisible()
        return true
    }
}

class WebViewController: UIViewController, WKScriptMessageHandler, WKNavigationDelegate {
    var webView: WKWebView!
    var store: Store?

    let saveURL: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Quizard", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("data.json")
    }()

    func savedData() -> String {
        (try? String(contentsOf: saveURL, encoding: .utf8)) ?? "null"
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.add(self, name: "save")
        cfg.userContentController.add(self, name: "buy")
        cfg.userContentController.add(self, name: "restore")
        cfg.userContentController.add(self, name: "prices")
        cfg.userContentController.addUserScript(WKUserScript(
            source: "window.__SAVED_DATA = \(savedData());",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: view.bounds, configuration: cfg)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.973, green: 0.949, blue: 0.878, alpha: 1)
        view.addSubview(webView)
        store = Store(webView: webView)
        if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        switch message.name {
        case "save":
            if let json = message.body as? String { try? json.write(to: saveURL, atomically: true, encoding: .utf8) }
        case "buy":
            if let pid = message.body as? String { store?.buy(pid) }
        case "restore":
            store?.restore()
        case "prices":
            store?.prices()
        default: break
        }
    }

    // external links (privacy policy etc.) open in Safari, everything else stays in-app
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url,
           ["http", "https"].contains(url.scheme ?? ""),
           navigationAction.navigationType == .linkActivated {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
}
