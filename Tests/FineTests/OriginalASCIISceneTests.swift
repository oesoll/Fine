import AppKit
import CryptoKit
import WebKit
import XCTest
@testable import Fine

final class OriginalASCIISceneTests: XCTestCase {
    func testBundledSourcesAreTheUnmodifiedUpstreamAndIncludeTheLicense() throws {
        let folder = try XCTUnwrap(OriginalASCIISceneNSView.resourceURL).deletingLastPathComponent()
        let vendor = folder.appendingPathComponent("ascii-rest")
        let expected = [
            "mount.ts": "36f60f0415211cb8c6d0fb4a2a530dd6dde2d156be87c3fb28e144619bf731ab",
            "types.ts": "0881f116be7fca1a7282e472ce1b6e5e04b7b897eefe6dca574a6b318dc1c177",
            "pieces/aurora-fjord.ts": "65e905d4a509ac3c676f840bbc0cd44bcb22aa89b0bf0907604ff97178cabd5d",
            "pieces/misty-forest.ts": "5b1a30b19ff9bd7dec166bc9d185d088fb3ea94d7e9de087a1075115ab8d33bf",
        ]
        for (name, hash) in expected {
            let bytes = try Data(contentsOf: vendor.appendingPathComponent(name))
            XCTAssertEqual(SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined(), hash, name)
        }
        let manifest = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: vendor.appendingPathComponent("upstream.json"))) as? [String: Any])
        let scenes = try XCTUnwrap(manifest["scenes"] as? [String])
        XCTAssertEqual(Set(scenes), Set(ASCIIScene.allCases.map(\.rawValue)))
        XCTAssertEqual(scenes.count, 15)
        for (path, digest) in try XCTUnwrap(manifest["sha256"] as? [String: String]) {
            let bytes = try Data(contentsOf: vendor.appendingPathComponent(path))
            XCTAssertEqual(SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined(), digest)
        }
        for scene in ASCIIScene.allCases {
            let preview = try XCTUnwrap(scene.thumbnailURL)
            XCTAssertNotNil(NSImage(contentsOf: preview))
        }
        let license = try String(contentsOf: vendor.appendingPathComponent("LICENSE"), encoding: .utf8)
        XCTAssertTrue(license.contains("Copyright (c) 2026 bas3line"))
        XCTAssertTrue(license.contains("Permission is hereby granted"))
        XCTAssertTrue(license.contains("THE SOFTWARE IS PROVIDED"))
    }

    @MainActor
    func testAuroraSceneSelectionRendersTheOriginalLocally() async throws {
        let view = OriginalASCIISceneNSView(frame: NSRect(x: 0, y: 0, width: 800, height: 400), scene: .auroraFjord)
        view.reduceMotion = true
        let window = NSWindow(contentRect: view.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = view
        defer { view.stop(); window.close() }
        try await waitUntil("aurora loaded") { view.isReady }
        let sceneState = try await state(view)
        XCTAssertEqual(sceneState["name"] as? String, "aurora fjord")
        let pixels = try await view.webView.evaluateJavaScript("""
            (() => {
              const c = document.querySelector('canvas');
              const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
              let green = 0;
              for (let i = 0; i < p.length; i += 4) if (p[i+1] > p[i] * 1.4 && p[i+1] > 45) green++;
              return green;
            })()
            """) as? Int
        XCTAssertGreaterThan(try XCTUnwrap(pixels), 1000)
        for scene in ASCIIScene.allCases {
            _ = try await view.webView.evaluateJavaScript("window.fineScene.setScene('\(scene.rawValue)', false)")
            let rawResult = try await view.webView.evaluateJavaScript("""
                (() => {
                    const c = document.querySelector('canvas');
                    const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
                    const colors = new Set();
                    for (let i = 0; i < p.length; i += 128) colors.add(`${p[i]},${p[i+1]},${p[i+2]}`);
                    return { id: window.fineScene.state.id, colors: colors.size };
                })()
                """)
            let result = try XCTUnwrap(rawResult as? [String: Any])
            XCTAssertEqual(result["id"] as? String, scene.rawValue)
            XCTAssertGreaterThan(try XCTUnwrap(result["colors"] as? Int), 10, scene.rawValue)
        }

    }

    func testAccessibilityPowerAndOcclusionPolicy() {
        for visible in [false, true] {
            for reduceMotion in [false, true] {
                for lowPower in [false, true] {
                    XCTAssertEqual(OriginalASCIISceneNSView.shouldAnimate(
                        visible: visible, reduceMotion: reduceMotion, lowPower: lowPower
                    ), visible && !reduceMotion && !lowPower)
                }
            }
        }
    }

    @MainActor
    func testCanvasCoversTallStandardAndWideWindowsWithoutStretching() async throws {
        let view = OriginalASCIISceneNSView(frame: NSRect(x: 0, y: 0, width: 512, height: 520))
        view.reduceMotion = true
        let window = NSWindow(contentRect: view.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = view
        defer { view.stop(); window.close() }
        try await waitUntil("local document loaded") { view.isReady }

        for size in [CGSize(width: 512, height: 520), CGSize(width: 1000, height: 800), CGSize(width: 1800, height: 600)] {
            window.setContentSize(size)
            view.layoutSubtreeIfNeeded()
            try await waitUntil("viewport resized to \(size)") {
                try await view.webView.evaluateJavaScript("innerWidth === \(Int(size.width)) && innerHeight === \(Int(size.height))") as? Bool == true
            }
            let geometry = try await view.webView.evaluateJavaScript("""
                (() => {
                  const r = document.querySelector('canvas').getBoundingClientRect();
                  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, ratio: r.width / r.height };
                })()
                """) as? [String: Double]
            let rect = try XCTUnwrap(geometry)
            XCTAssertLessThanOrEqual(try XCTUnwrap(rect["left"]), 0.5)
            XCTAssertLessThanOrEqual(try XCTUnwrap(rect["top"]), 0.5)
            XCTAssertGreaterThanOrEqual(try XCTUnwrap(rect["right"]), size.width - 0.5)
            XCTAssertGreaterThanOrEqual(try XCTUnwrap(rect["bottom"]), size.height - 0.5)
            XCTAssertEqual(try XCTUnwrap(rect["ratio"]), 2, accuracy: 0.001)
        }
    }

    @MainActor
    func testOriginalCanvasRendersOfflineAndAdapterPreservesTimeAcrossPause() async throws {
        let view = OriginalASCIISceneNSView(frame: NSRect(x: 0, y: 0, width: 800, height: 400))
        view.reduceMotion = true
        let window = NSWindow(contentRect: view.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = view
        defer { view.stop(); window.close() }
        try await waitUntil("local document loaded") { view.isReady }
        let canvas = try await view.webView.evaluateJavaScript("""
            (() => {
              const c = document.querySelector('canvas');
              const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
              let bright = 0, colored = 0;
              for (let i = 0; i < p.length; i += 4) {
                if (p[i] + p[i+1] + p[i+2] > 200) bright++;
                if (p[i+1] > p[i] * 1.4 && p[i+1] > 45) colored++;
              }
              return { bright, colored, width: c.width, height: c.height,
                local: location.protocol === 'file:' && performance.getEntriesByType('resource').every(r => r.name.startsWith('file:')) };
            })()
            """) as? [String: Any]
        let result = try XCTUnwrap(canvas)
        XCTAssertEqual(result["local"] as? Bool, true)
        XCTAssertGreaterThan(try XCTUnwrap(result["bright"] as? Int), 1000)
        XCTAssertGreaterThan(try XCTUnwrap(result["colored"] as? Int), 1000)
        XCTAssertEqual(try XCTUnwrap(result["width"] as? Double) / XCTUnwrap(result["height"] as? Double), 2)
        XCTAssertNil(view.hitTest(CGPoint(x: 50, y: 50)))
        let initialState = try await state(view)
        XCTAssertEqual(initialState["time"] as? Double, 0)

        // Command-line XCTest has no visible WebKit page. Control only visibility
        // and the clock in this fixture; the original renderer and scene execute
        // unchanged on the real canvas. Native power/visibility policy is above.
        _ = try await view.webView.evaluateJavaScript("""
            (() => {
              let now = 0, id = 0;
              const callbacks = new Map();
              Object.defineProperty(document, 'hidden', { value: false, configurable: true });
              Object.defineProperty(performance, 'now', { value: () => now, configurable: true });
              window.requestAnimationFrame = callback => { callbacks.set(++id, callback); return id; };
              window.cancelAnimationFrame = key => callbacks.delete(key);
              window.IntersectionObserver = class {
                constructor(callback) { this.callback = callback; }
                observe() { this.callback([{ isIntersecting: true }]); }
                disconnect() {}
              };
              window.advanceSceneFrames = count => {
                for (let i = 0; i < count; i++) {
                  now += 1000 / 15;
                  const batch = [...callbacks.values()];
                  callbacks.clear();
                  batch.forEach(callback => callback(now));
                }
              };
              window.fineScene.setPlaying(true);
              window.advanceSceneFrames(8);
            })()
            """)
        let animated = try await state(view)
        XCTAssertGreaterThan(try XCTUnwrap(animated["time"] as? Double), 0.2)
        XCTAssertGreaterThan(try XCTUnwrap(animated["draws"] as? Int), 2)
        _ = try await view.webView.evaluateJavaScript("window.fineScene.setPlaying(false)")
        let paused = try await state(view)
        _ = try await view.webView.evaluateJavaScript("window.advanceSceneFrames(20)")
        let stillPaused = try await state(view)
        XCTAssertEqual(stillPaused["time"] as? Double, paused["time"] as? Double)
        XCTAssertEqual(stillPaused["draws"] as? Int, paused["draws"] as? Int)
        _ = try await view.webView.evaluateJavaScript("window.fineScene.setPlaying(true); window.advanceSceneFrames(4)")
        let resumed = try await state(view)
        XCTAssertGreaterThan(try XCTUnwrap(resumed["time"] as? Double), try XCTUnwrap(paused["time"] as? Double))
        _ = try await view.webView.evaluateJavaScript("window.fineScene.setScene('aurora-fjord', false); window.fineScene.setScene('misty-forest', false)")
        let returned = try await state(view)
        XCTAssertEqual(returned["time"] as? Double, resumed["time"] as? Double)
        print("Original Misty Forest: local canvas \(result), deterministic pause/resume verified")
    }

    @MainActor
    private func state(_ view: OriginalASCIISceneNSView) async throws -> [String: Any] {
        let result = try await view.webView.evaluateJavaScript("window.fineScene.state")
        return try XCTUnwrap(result as? [String: Any])
    }

    @MainActor
    private func waitUntil(_ step: String, _ predicate: () async throws -> Bool) async throws {
        for _ in 0..<150 {
            if try await predicate() { return }
            try await Task.sleep(for: .milliseconds(50))
        }
        XCTFail("Timed out: \(step)")
        throw NSError(domain: "OriginalASCIISceneTests", code: 1)
    }
}
