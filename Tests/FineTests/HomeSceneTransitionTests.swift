import AppKit
import Testing
import WebKit
@testable import Fine

@MainActor @Suite(.serialized)
struct HomeSceneTransitionTests {
    @Test func retargetsFromVisiblePixelsWithoutReloadAndHonorsReducedMotion() async throws {
        let view = OriginalASCIISceneNSView(frame: NSRect(x: 0, y: 0, width: 800, height: 400))
        view.reduceMotion = true
        let window = NSWindow(contentRect: view.frame, styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.contentView = view
        defer { view.stop(); window.close() }
        for _ in 0..<150 {
            if view.isReady { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        try #require(view.isReady)
        let originalURL = view.webView.url
        let pixels = try #require(try await view.webView.evaluateJavaScript("""
            (() => {
                const api = window.fineScene;
                api.setScene('ocean-sunset', true);
                const old = document.querySelector('#outgoing');
                old.getAnimations()[0].currentTime = 100;
                const alpha = Number(getComputedStyle(old).opacity);
                const live = document.querySelector('#scene');
                const expected = document.createElement('canvas');
                expected.width = live.width; expected.height = live.height;
                const ctx = expected.getContext('2d');
                ctx.drawImage(live, 0, 0);
                ctx.globalAlpha = alpha;
                ctx.drawImage(old, 0, 0, live.width, live.height);
                const before = ctx.getImageData(0, 0, live.width, live.height).data;
                api.setScene('alpine-dawn', true);
                const after = old.getContext('2d').getImageData(0, 0, old.width, old.height).data;
                let delta = 0;
                for (let i = 0; i < before.length; i += 4) delta += Math.abs(before[i] - after[i]);
                return { delta: delta / (before.length / 4), alpha, layers: api.state.layers };
            })()
            """) as? [String: Double])
        #expect(try #require(pixels["alpha"]) > 0)
        #expect(try #require(pixels["alpha"]) < 1)
        #expect(try #require(pixels["delta"]) < 1)
        #expect(pixels["layers"] == 2)

        // Rapid changes go through the same NSView and document, including while
        // another transition is in flight. The final target always wins.
        var presented: [ASCIIScene] = []
        view.onPresented = { presented.append($0) }
        view.reduceMotion = false
        for scene in [ASCIIScene.deepReef, .desertNight, .kyotoDusk, .nightCoast, .auroraFjord] {
            view.setScene(scene)
        }
        let state = try #require(try await view.webView.evaluateJavaScript("window.fineScene.state") as? [String: Any])
        #expect(state["id"] as? String == "aurora-fjord")
        #expect(presented.last == .auroraFjord)
        #expect(state["layers"] as? Int == 2)
        #expect(view.webView.url == originalURL)
        #expect(view.webView.backForwardList.backList.isEmpty)
        view.reduceMotion = true
        view.setScene(.earthrise)
        let reduced = try #require(try await view.webView.evaluateJavaScript("window.fineScene.state") as? [String: Any])
        #expect(reduced["id"] as? String == "earthrise")
        #expect(presented.last == .earthrise)
        #expect(reduced["transitioning"] as? Bool == false)
        #expect(reduced["outgoingOpacity"] as? Double == 0)
        #expect(reduced["playing"] as? Bool == false)
    }
}
