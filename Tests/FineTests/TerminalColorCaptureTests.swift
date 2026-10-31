import AppKit
import WebKit
import XCTest
@testable import Fine

/// 에이전트가 실제로 내보낸 화면(`tmux capture-pane -e`)을 Fine 터미널에 그대로 먹여
/// 팔레트별로 찍는다. 색은 xterm(WebGL) 안에서 정해지므로 창 서버에서 합성된 것을 본다.
/// `FINE_CAPTURE=1`일 때만 돈다. 입력은 `.build/terminal-color-review/fixtures/*.ans`,
/// 결과는 같은 폴더 위의 PNG.
final class TerminalColorCaptureTests: XCTestCase {
    @MainActor
    func testCaptureAgentOutputInBothThemes() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["FINE_CAPTURE"] == "1", "set FINE_CAPTURE=1")
        let folder = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(".build/terminal-color-review")
        let tag = ProcessInfo.processInfo.environment["FINE_CAPTURE_TAG"].map { "-\($0)" } ?? ""
        for (fixture, harness) in [("claude", QuickHarness.claude), ("codex", .codex)] {
            let url = folder.appendingPathComponent("fixtures/\(fixture).ans")
            guard let text = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let bytes = Data(text.replacingOccurrences(of: "\n", with: "\r\n").utf8)
            for dark in [false, true] {
                let image = try render(bytes, palette: .forHarness(harness, isDark: dark))
                let png = try XCTUnwrap(NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]))
                try png.write(to: folder.appendingPathComponent("\(fixture)-\(dark ? "dark" : "light")\(tag).png"))
            }
        }
    }

    @MainActor
    private func render(_ bytes: Data, palette: TerminalPalette) throws -> CGImage {
        let size = NSSize(width: 900, height: 640)
        let terminal = TerminalWebView(frame: NSRect(origin: .zero, size: size), palette: palette,
                                       statusText: "", footerCrop: 0)
        let window = NSWindow(contentRect: NSRect(x: 60, y: 60, width: size.width, height: size.height),
                              styleMask: [.borderless], backing: .buffered, defer: false)
        window.appearance = NSAppearance(named: palette.isDark ? .darkAqua : .aqua)
        // 테스트 프로세스의 창은 WebKit이 '가려짐'으로 보고 페이지를 hidden으로 둔다 —
        // 그러면 xterm이 한 프레임도 그리지 않는다. 가림 감지를 끄고 앞에 띄운다.
        if let web = terminal.subviews.first as? WKWebView {
            let selector = NSSelectorFromString("_setWindowOcclusionDetectionEnabled:")
            if web.responds(to: selector) {
                typealias Setter = @convention(c) (AnyObject, Selector, Bool) -> Void
                unsafeBitCast(web.method(for: selector), to: Setter.self)(web, selector, false)
            }
        }
        window.contentView = terminal
        NSApp.setActivationPolicy(.accessory)
        window.level = .floating
        window.orderFrontRegardless()
        defer { window.orderOut(nil) }
        RunLoop.main.run(until: Date().addingTimeInterval(2.0))
        terminal.feed(bytes)
        RunLoop.main.run(until: Date().addingTimeInterval(1.2))
        // 창 크기 변화가 fit과 전체 다시 그리기를 부른다 — 첫 프레임만 찍히는 것을 막는다.
        window.setContentSize(NSSize(width: size.width, height: size.height - 1))
        RunLoop.main.run(until: Date().addingTimeInterval(0.3))
        window.setContentSize(size)
        RunLoop.main.run(until: Date().addingTimeInterval(1.5))
        // 테스트 창에서는 WebGL 캔버스가 어떤 캡처에도 잡히지 않는다. 같은 테마로 칠하는
        // xterm 기본(DOM) 렌더러로 내려서 찍는다 — 색은 테마와 대비 보정이 정한다.
        let web = try XCTUnwrap(terminal.subviews.first as? WKWebView)
        web.evaluateJavaScript("""
            term._addonManager._addons.forEach(a => { if (a.instance.constructor.name.includes('Webgl')) a.instance.dispose(); });
            term.refresh(0, term.rows - 1);
            """, completionHandler: nil)
        RunLoop.main.run(until: Date().addingTimeInterval(0.8))
        var shot: NSImage?
        web.takeSnapshot(with: nil) { image, _ in shot = image }
        let deadline = Date().addingTimeInterval(5)
        while shot == nil && Date() < deadline { RunLoop.main.run(until: Date().addingTimeInterval(0.05)) }
        return try XCTUnwrap(XCTUnwrap(shot).cgImage(forProposedRect: nil, context: nil, hints: nil))
    }
}
