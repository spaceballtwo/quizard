// StoreKit 2 checkout. JS asks to buy/restore via message handlers; results
// return through window.quizardPurchase / window.quizardRestore callbacks.
import StoreKit
import WebKit

let PLAN_FOR_PRODUCT: [String: String] = [
    "app.quizard.solo.season": "solo",
    "app.quizard.unlimited.season": "unlimited",
    "app.quizard.family.season": "family",
]

@MainActor
final class Store {
    weak var webView: WKWebView?
    init(webView: WKWebView) {
        self.webView = webView
        Task { await listenForTransactions() }
    }

    func js(_ code: String) { webView?.evaluateJavaScript(code) }

    func buy(_ productID: String) {
        Task {
            do {
                guard let product = try await Product.products(for: [productID]).first else {
                    js("window.quizardPurchase && window.quizardPurchase({ok:false, msg:'Product not found'})"); return
                }
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    if case .verified(let txn) = verification {
                        let plan = PLAN_FOR_PRODUCT[txn.productID] ?? "solo"
                        js("window.quizardPurchase && window.quizardPurchase({ok:true, plan:'\(plan)'})")
                        await txn.finish()
                    } else {
                        js("window.quizardPurchase && window.quizardPurchase({ok:false, msg:'Could not verify purchase'})")
                    }
                case .userCancelled:
                    js("window.quizardPurchase && window.quizardPurchase({ok:false, cancelled:true})")
                case .pending:
                    js("window.quizardPurchase && window.quizardPurchase({ok:false, pending:true, msg:'Waiting for approval — Ask to Buy'})")
                @unknown default:
                    js("window.quizardPurchase && window.quizardPurchase({ok:false, msg:'Unknown result'})")
                }
            } catch {
                js("window.quizardPurchase && window.quizardPurchase({ok:false, msg:'Purchase failed'})")
            }
        }
    }

    func restore() {
        Task {
            var plans: [String] = []
            for await entitlement in Transaction.currentEntitlements {
                if case .verified(let txn) = entitlement, let p = PLAN_FOR_PRODUCT[txn.productID] { plans.append(p) }
            }
            let list = plans.map { "'\($0)'" }.joined(separator: ",")
            js("window.quizardRestore && window.quizardRestore([\(list)])")
        }
    }

    func prices() {
        Task {
            do {
                let products = try await Product.products(for: Array(PLAN_FOR_PRODUCT.keys))
                let entries = products.compactMap { p -> String? in
                    guard let plan = PLAN_FOR_PRODUCT[p.id] else { return nil }
                    return "'\(plan)':'\(p.displayPrice)'"
                }.joined(separator: ",")
                js("window.quizardPrices && window.quizardPrices({\(entries)})")
            } catch { }
        }
    }

    // renewals / Ask-to-Buy approvals / family sharing arriving while app runs
    func listenForTransactions() async {
        for await update in Transaction.updates {
            if case .verified(let txn) = update {
                if let plan = PLAN_FOR_PRODUCT[txn.productID] {
                    js("window.quizardPurchase && window.quizardPurchase({ok:true, plan:'\(plan)'})")
                }
                await txn.finish()
            }
        }
    }
}
