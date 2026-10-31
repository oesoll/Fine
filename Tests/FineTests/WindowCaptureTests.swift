import AppKit
import SwiftUI
import XCTest
@testable import Fine

/// 사이드바까지 포함한 창 전체를 찍는다 — 홈의 장면이 사이드바 밑으로 비치는지 본다.
/// 앱 데이터를 건드리지 않도록 `FINE_CAPTURE=1`이고 `FINE_HOME`이 격리된 폴더일 때만 돈다.
final class WindowCaptureTests: XCTestCase {
    @MainActor
    func testCaptureWholeHomeWindow() throws {
        let env = ProcessInfo.processInfo.environment
        try XCTSkipUnless(env["FINE_CAPTURE"] == "1", "set FINE_CAPTURE=1")
        let realHome = String(cString: getpwuid(getuid())!.pointee.pw_dir)
        guard let fineHome = env["FINE_HOME"], !fineHome.hasPrefix(realHome + "/.fine") else {
            throw XCTSkip("run with an isolated FINE_HOME")
        }
        let tag = env["FINE_CAPTURE_TAG"].map { "-\($0)" } ?? ""
        for (name, dark, background) in [("window-light-forest", false, HomeBackground.forest),
                                         ("window-dark-photo", true, .photo),
                                         ("window-dark-lantern", true, .lanternLake)] {
            HomeBackgroundSettings.shared.select(background, for: dark ? .dark : .light)
            let size = NSSize(width: 1240, height: 780)
            let window = NSWindow(contentRect: NSRect(x: 40, y: 40, width: size.width, height: size.height),
                                  styleMask: [.titled, .fullSizeContentView, .closable, .resizable],
                                  backing: .buffered, defer: false)
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .hidden
            window.isOpaque = false
            window.backgroundColor = .clear
            window.isReleasedWhenClosed = false
            window.appearance = NSAppearance(named: dark ? .darkAqua : .aqua)
            window.contentView = NSHostingView(rootView: ContentView())
            NSApp.setActivationPolicy(.accessory)
            window.level = .floating
            window.orderFrontRegardless()
            RunLoop.main.run(until: Date().addingTimeInterval(3.0))

            typealias CreateImage = @convention(c) (CGRect, UInt32, UInt32, UInt32) -> Unmanaged<CGImage>?
            let handle = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", RTLD_NOW)
            let createImage = unsafeBitCast(try XCTUnwrap(dlsym(handle, "CGWindowListCreateImage")), to: CreateImage.self)
            let image = try XCTUnwrap(createImage(.null, 1 << 3, UInt32(window.windowNumber), 1)?.takeRetainedValue())
            window.orderOut(nil)
            let png = try XCTUnwrap(NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]))
            let folder = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
                .deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent(".build/home-glass-review")
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            try png.write(to: folder.appendingPathComponent("\(name)\(tag).png"))
        }
    }
}
