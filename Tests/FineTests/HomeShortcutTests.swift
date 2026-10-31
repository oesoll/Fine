import AppKit
import Testing
@testable import Fine

@MainActor
struct HomeShortcutTests {
    private func event(_ type: NSEvent.EventType, key: UInt16 = 124, window: NSWindow,
                       modifiers: NSEvent.ModifierFlags = .command, repeatKey: Bool = false) throws -> NSEvent {
        try #require(NSEvent.keyEvent(with: type, location: .zero, modifierFlags: modifiers,
            timestamp: 0, windowNumber: window.windowNumber, context: nil, characters: "",
            charactersIgnoringModifiers: "", isARepeat: repeatKey, keyCode: key))
    }

    @Test func releaseCommitsOnceAndPlainArrowsPassThrough() throws {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 400, height: 200),
                              styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        let view = HomeShortcutView()
        window.contentView = view
        defer { view.detach(); window.close() }
        var steps: [Int] = []
        view.onStep = { steps.append($0) }
        #expect(view.handle(try event(.keyDown, window: window)) == nil)
        #expect(steps.isEmpty)
        #expect(view.handle(try event(.keyDown, window: window, repeatKey: true)) == nil)
        #expect(view.handle(try event(.keyUp, window: window)) == nil)
        #expect(steps == [1])
        #expect(view.handle(try event(.keyDown, key: 123, window: window)) == nil)
        #expect(view.handle(try event(.keyUp, key: 123, window: window)) == nil)
        #expect(steps == [1, -1])
        #expect(view.handle(try event(.keyDown, window: window, modifiers: [])) != nil)
        #expect(view.handle(try event(.keyDown, window: window, modifiers: [.command, .shift])) != nil)
        view.isEnabled = false
        #expect(view.handle(try event(.keyDown, window: window)) != nil)
    }

    @Test func holdingOpensOnceWithoutCyclingAndFocusLossCancels() async throws {
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 400, height: 200),
                              styleMask: [.titled], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        let view = HomeShortcutView()
        window.contentView = view
        defer { view.detach(); window.close() }
        var steps = 0, opens = 0
        view.onStep = { _ in steps += 1 }
        view.onPresent = { [weak view] in opens += 1; view?.isEnabled = false }
        #expect(view.handle(try event(.keyDown, window: window)) == nil)
        try await Task.sleep(for: .milliseconds(650))
        #expect(opens == 1)
        #expect(view.handle(try event(.keyDown, window: window, repeatKey: true)) == nil)
        #expect(view.handle(try event(.keyUp, window: window)) == nil)
        #expect(steps == 0)
        view.isEnabled = true
        #expect(view.handle(try event(.keyDown, window: window)) == nil)
        NotificationCenter.default.post(name: NSWindow.didResignKeyNotification, object: window)
        try await Task.sleep(for: .milliseconds(650))
        #expect(opens == 1)
        #expect(steps == 0)
    }
}
