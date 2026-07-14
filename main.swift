import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var webView: WKWebView!

    // Where all local accounts (names, PINs, XP) are saved between launches.
    let dataFile: URL = {
        let base = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("SSATPractice", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base.appendingPathComponent("data.json")
    }()

    func savedData() -> String {
        if let data = try? Data(contentsOf: dataFile),
           let s = String(data: data, encoding: .utf8),
           !s.isEmpty { return s }
        return "null"
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        let rect = NSRect(x: 0, y: 0, width: 820, height: 920)
        window = NSWindow(
            contentRect: rect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false)
        window.title = "Quizard"
        window.center()
        window.minSize = NSSize(width: 480, height: 600)

        let controller = WKUserContentController()
        controller.add(self, name: "save")
        // Inject the saved accounts blob before the page's own script runs.
        let inject = WKUserScript(
            source: "window.__SAVED_DATA = \(savedData());",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true)
        controller.addUserScript(inject)

        let config = WKWebViewConfiguration()
        config.userContentController = controller

        webView = WKWebView(frame: rect, configuration: config)
        webView.autoresizingMask = [.width, .height]

        if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }

        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func userContentController(_ controller: WKUserContentController,
                              didReceive message: WKScriptMessage) {
        guard message.name == "save", let json = message.body as? String else { return }
        try? json.data(using: .utf8)?.write(to: dataFile)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
