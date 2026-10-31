// swift scripts/generate-scene-previews.swift Sources/Fine/Scenes
// Render upstream's actual canvas; the picker never creates a WebView per tile.
import AppKit
import WebKit

@MainActor final class PreviewGenerator: NSObject, WKNavigationDelegate {
    let directory: URL
    let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 560, height: 280))
    init(directory: URL) {
        self.directory = directory
        super.init()
        view.navigationDelegate = self
        view.loadFileURL(directory.appendingPathComponent("scene.html"), allowingReadAccessTo: directory)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            do {
                let names = try await webView.evaluateJavaScript("window.fineScene.names") as! [String]
                let output = directory.appendingPathComponent("previews")
                try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
                for name in names {
                    let jsonName = String(data: try JSONEncoder().encode(name), encoding: .utf8)!
                    _ = try await webView.evaluateJavaScript("window.fineScene.setScene(\(jsonName), false)")
                    let png = try await webView.evaluateJavaScript("window.fineScene.thumbnail()") as! String
                    let bytes = Data(base64Encoded: String(png.split(separator: ",", maxSplits: 1)[1]))!
                    try bytes.write(to: output.appendingPathComponent(name + ".png"))
                    print("\(name): \(bytes.count) bytes")
                }
                NSApp.terminate(nil)
            } catch {
                fputs("\(error)\n", stderr)
                exit(1)
            }
        }
    }
}
let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let generator = MainActor.assumeIsolated { PreviewGenerator(directory: URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true).standardizedFileURL) }
app.run()
