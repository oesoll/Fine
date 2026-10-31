import AppKit
import SwiftUI
import XCTest
@testable import Fine

/// 유리(머티리얼)와 WebKit 장면은 `cacheDisplay`로 찍히지 않는다. 화면에 실제로 띄운 창을
/// 창 서버에서 합성된 그대로 찍어야 입력창 너머로 배경이 얼마나 비치는지 볼 수 있다.
/// 자기 프로세스의 창은 화면 기록 권한 없이 찍힌다. 창이 잠깐 떠야 하므로
/// `FINE_CAPTURE=1`일 때만 돈다 — 결과는 `.build/home-glass-review/`.
final class HomeGlassCaptureTests: XCTestCase {
    @MainActor
    func testCaptureHomeOverRealComposite() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["FINE_CAPTURE"] == "1", "set FINE_CAPTURE=1")
        let cases: [(String, ColorScheme, HomeBackground, CGSize)] = [
            ("light-forest", .light, .forest, CGSize(width: 1000, height: 800)),
            ("light-forest-wide", .light, .forest, CGSize(width: 1400, height: 900)),
            ("light-forest-min", .light, .forest, CGSize(width: 512, height: 520)),
            ("light-alpine", .light, .alpineDawn, CGSize(width: 1000, height: 800)),
            ("light-aurora-window", .light, .auroraWindow, CGSize(width: 1000, height: 800)),
            ("dark-photo", .dark, .photo, CGSize(width: 1000, height: 800)),
            ("dark-lantern", .dark, .lanternLake, CGSize(width: 1000, height: 800)),
            ("dark-varanasi", .dark, .varanasiGhats, CGSize(width: 1240, height: 800)),
            ("dark-aurora-window", .dark, .auroraWindow, CGSize(width: 1000, height: 800)),
        ]
        let only = ProcessInfo.processInfo.environment["FINE_CAPTURE_ONLY"]
        for (name, scheme, background, size) in cases where only.map({ name.contains($0) }) ?? true {
            try capture(name: name, scheme: scheme, background: background, size: size)
        }
    }

    @MainActor
    private func capture(name: String, scheme: ColorScheme, background: HomeBackground, size: CGSize) throws {
        let suite = "HomeGlassCaptureTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let backgrounds = HomeBackgroundSettings(defaults: defaults)
        backgrounds.select(background, for: scheme == .dark ? .dark : .light)
        let root = QuickHomePresentation(backgrounds: backgrounds) {
            VStack(spacing: 14) {
                QuickHomeComposer(prompt: .constant(ProcessInfo.processInfo.environment["FINE_CAPTURE_PROMPT"] ?? ""), onSubmit: {}) {
                    QuickHomeControls {
                        HarnessSegmentedControl(selection: .constant(.claude))
                    } options: {
                        FineControlPill(title: "Opus 5 · 높음") {
                            Image(systemName: "sparkle").font(.system(size: 10, weight: .semibold))
                        }
                        .fixedSize()
                    } send: {
                        HStack(spacing: 10) {
                            FineGhostIcon(systemName: "magnifyingglass")
                            FineKeyHint(items: [("↩", "보내기"), ("⌥↩", "줄바꿈")]).layoutPriority(-1)
                            SendGlyph(isReady: !(ProcessInfo.processInfo.environment["FINE_CAPTURE_PROMPT"] ?? "").isEmpty)
                        }
                    }
                }
                .homeArtworkScheme()
                VStack(spacing: 16) {
                    HomeChipRow {
                        HomeChip(text: "/찾기", detail: "⌘F")
                        HomeChip(text: "↗ 가성비 패키지여행 신청처")
                        HomeChip(text: "↗ 부천 근교 스파디움 유사 시설")
                        HomeChip(text: "↗ t.co 링크 스킬")
                    }
                    Text("Claude로 시작합니다")
                        .font(FineHomeFont.label("Claude로 시작합니다", size: 11.5))
                        .homeArtworkText()
                        .opacity(0.6)
                        .homeTextScrim(0.45)
                }
            }
        }
        .preferredColorScheme(scheme)
        let window = NSWindow(contentRect: NSRect(x: 40, y: 40, width: size.width, height: size.height),
                              styleMask: [.borderless], backing: .buffered, defer: false)
        window.appearance = NSAppearance(named: scheme == .dark ? .darkAqua : .aqua)
        window.contentView = NSHostingView(rootView: root)
        window.orderFrontRegardless()
        defer { window.orderOut(nil) }
        // WebKit이 첫 장면을 그리고, 레이아웃 스프링과 글자색 전환이 끝날 때까지.
        RunLoop.main.run(until: Date().addingTimeInterval(2.5))

        typealias CreateImage = @convention(c) (CGRect, UInt32, UInt32, UInt32) -> Unmanaged<CGImage>?
        let handle = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", RTLD_NOW)
        let symbol = try XCTUnwrap(dlsym(handle, "CGWindowListCreateImage"))
        let createImage = unsafeBitCast(symbol, to: CreateImage.self)
        // kCGWindowListOptionIncludingWindow, kCGWindowImageBoundsIgnoreFraming
        let image = try XCTUnwrap(createImage(.null, 1 << 3, UInt32(window.windowNumber), 1)?.takeRetainedValue())
        let png = try XCTUnwrap(NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]))
        let folder = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(".build/home-glass-review")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let tag = ProcessInfo.processInfo.environment["FINE_CAPTURE_TAG"].map { "-\($0)" } ?? ""
        try png.write(to: folder.appendingPathComponent("\(name)\(tag).png"))
    }
}
