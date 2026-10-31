import AppKit
import GhosttyTerminal
import XCTest
@testable import Fine

/// 에이전트가 실제로 내보낸 화면(`tmux capture-pane -e`)을 Fine 터미널(libghostty)에 그대로 흘려
/// 팔레트별로 찍는다. 색은 Metal 표면에서 정해지므로 창 서버에서 합성된 창을 찍는다.
/// `FINE_CAPTURE=1`일 때만 돈다. 입력은 `.build/terminal-color-review/fixtures/*.ans`(없으면 내장 표본),
/// 결과는 같은 폴더 위의 PNG.
final class TerminalColorCaptureTests: XCTestCase {
    @MainActor
    func testCaptureAgentOutputInBothThemes() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["FINE_CAPTURE"] == "1", "set FINE_CAPTURE=1")
        let folder = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(".build/terminal-color-review")
        try FileManager.default.createDirectory(at: folder.appendingPathComponent("fixtures"),
                                                withIntermediateDirectories: true)
        let tag = ProcessInfo.processInfo.environment["FINE_CAPTURE_TAG"].map { "-\($0)" } ?? ""
        for (fixture, harness) in [("claude", QuickHarness.claude), ("codex", .codex), ("sample", .claude)] {
            let url = folder.appendingPathComponent("fixtures/\(fixture).ans")
            if fixture == "sample" { try Self.sample.write(to: url, atomically: true, encoding: .utf8) }
            guard FileManager.default.fileExists(atPath: url.path) else { continue }
            for palette in [TerminalPalette.forHarness(harness, isDark: false), .forHarness(harness, isDark: true),
                            .overArtwork] {
                let name = palette == .overArtwork ? "artwork" : (palette.isDark ? "dark" : "light")
                let image = try render(fixture: url, palette: palette, harness: harness)
                let png = try XCTUnwrap(NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]))
                try png.write(to: folder.appendingPathComponent("\(fixture)-\(name)\(tag).png"))
            }
        }
    }

    /// 한글 본문, 16색, 프롬프트 면(100), Claude의 힌트 줄(마지막 줄 — 가려져야 한다).
    private static let sample = """
    \u{1B}[1m⏺\u{1B}[0m 리뷰를 마쳤습니다. 결제 금액 반올림이 두 군데에서 다릅니다.
      \u{1B}[2m⎿  PriceRow는 Math.round, OrderSummary는 Math.floor\u{1B}[0m

    \u{1B}[30m■30\u{1B}[31m■31\u{1B}[32m■32\u{1B}[33m■33\u{1B}[34m■34\u{1B}[35m■35\u{1B}[36m■36\u{1B}[37m■37\u{1B}[0m \u{1B}[90m■90\u{1B}[91m■91\u{1B}[92m■92\u{1B}[93m■93\u{1B}[94m■94\u{1B}[95m■95\u{1B}[96m■96\u{1B}[97m■97\u{1B}[0m

    \u{1B}[100m\u{1B}[97m > 결제 금액을 다시 확인해 줘                                              \u{1B}[0m
    """

    /// Claude Code의 힌트 줄처럼 터미널의 맨 아래 줄에 찍는다. Claude 탭에서는 보이면 안 된다.
    private static let hintRow = "\\033[999;1HHINT-ROW ? for shortcuts"

    @MainActor
    private func render(fixture: URL, palette: TerminalPalette, harness: QuickHarness) throws -> CGImage {
        _ = NSApplication.shared
        try XCTSkipUnless(GhosttyRuntime.shared.isAvailable, "libghostty did not initialise")
        let size = NSSize(width: 900, height: 420)
        let window = NSWindow(contentRect: NSRect(x: 60, y: 60, width: size.width, height: size.height),
                              styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.appearance = NSAppearance(named: palette.isDark ? .darkAqua : .aqua)
        // 홈 장면 위 탭은 바탕이 비어 있다. 비치는 것이 보이게 창 바탕을 색으로 깐다.
        window.backgroundColor = palette == .overArtwork ? .systemIndigo : (palette.isDark ? .black : .white)
        let view = FineTerminalView(palette: palette, statusText: "claude-opus-5-5 · high", harness: harness,
                                    cropsFooterRow: harness == .claude)
        view.frame = NSRect(origin: .zero, size: size)
        window.contentView = view
        NSApp.setActivationPolicy(.accessory)
        window.level = .floating
        window.orderFrontRegardless()
        // 끝까지 그린 뒤에도 화면이 남게 cat 뒤에 잠든다(커서는 감춘다).
        let hint = fixture.lastPathComponent == "sample.ans" ? "printf \"\(Self.hintRow)\"; " : ""
        view.start(.init(command: "/bin/sh -c 'printf \"\\033[?25l\"; cat \(fixture.path); \(hint)sleep 30'",
                         workingDirectory: NSHomeDirectory()))
        defer { view.terminate(synchronously: true); window.orderOut(nil) }
        RunLoop.main.run(until: Date().addingTimeInterval(1.5))

        typealias CreateImage = @convention(c) (CGRect, UInt32, UInt32, UInt32) -> Unmanaged<CGImage>?
        let handle = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", RTLD_NOW)
        let createImage = unsafeBitCast(try XCTUnwrap(dlsym(handle, "CGWindowListCreateImage")), to: CreateImage.self)
        return try XCTUnwrap(createImage(.null, 1 << 3, UInt32(window.windowNumber), 1)?.takeRetainedValue())
    }
}
