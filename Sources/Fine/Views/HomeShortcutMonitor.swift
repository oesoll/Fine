import AppKit
import SwiftUI

/// A short chord commits on release; holding opens the picker without first
/// changing the wallpaper. Key repeat never causes extra selections.
struct HomeShortcutMonitor: NSViewRepresentable {
    var isEnabled: Bool
    let onStep: (Int) -> Void
    let onPresent: () -> Void

    func makeNSView(context: Context) -> HomeShortcutView { HomeShortcutView() }
    func updateNSView(_ view: HomeShortcutView, context: Context) {
        view.isEnabled = isEnabled
        view.onStep = onStep
        view.onPresent = onPresent
    }
    static func dismantleNSView(_ view: HomeShortcutView, coordinator: ()) { view.detach() }
}

final class HomeShortcutView: NSView {
    static let holdDelay: TimeInterval = 0.5
    var isEnabled = true
    var onStep: ((Int) -> Void)?
    var onPresent: (() -> Void)?
    private var monitor: Any?
    private var observers: [NSObjectProtocol] = []
    private var timer: Timer?
    private var pressedKey: UInt16?
    private var openedPicker = false

    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        detach()
        guard let window else { return }
        monitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .keyUp, .flagsChanged]) { [weak self] event in
            guard let self else { return event }
            return self.handle(event)
        }
        observers.append(NotificationCenter.default.addObserver(forName: NSWindow.didResignKeyNotification,
            object: window, queue: .main) { [weak self] _ in self?.cancelPress() })
        observers.append(NotificationCenter.default.addObserver(forName: NSApplication.didResignActiveNotification,
            object: nil, queue: .main) { [weak self] _ in self?.cancelPress() })
    }

    func handle(_ event: NSEvent) -> NSEvent? {
        guard let window, event.window === window, window.attachedSheet == nil else { return event }
        if event.type == .flagsChanged {
            if !event.modifierFlags.contains(.command) { finishPress() }
            return event
        }
        if event.type == .keyUp, event.keyCode == pressedKey {
            finishPress()
            return nil
        }
        guard event.type == .keyDown, event.keyCode == 123 || event.keyCode == 124 else { return event }
        let modifiers = event.modifierFlags.intersection([.command, .shift, .option, .control])
        guard modifiers == .command else { cancelPress(); return event }
        if event.keyCode == pressedKey { return nil }
        guard isEnabled, !event.isARepeat else { return event }
        cancelPress()
        pressedKey = event.keyCode
        timer = Timer.scheduledTimer(withTimeInterval: Self.holdDelay, repeats: false) { [weak self] _ in
            guard let self, self.pressedKey != nil, self.isEnabled else { return }
            self.openedPicker = true
            self.onPresent?()
        }
        return nil
    }

    private func finishPress() {
        let step = pressedKey.map { $0 == 123 ? -1 : 1 }
        let shouldStep = !openedPicker && isEnabled
        cancelPress()
        if shouldStep, let step { onStep?(step) }
    }

    func cancelPress() {
        timer?.invalidate()
        timer = nil
        pressedKey = nil
        openedPicker = false
    }

    func detach() {
        cancelPress()
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
        observers.forEach(NotificationCenter.default.removeObserver)
        observers.removeAll()
    }
    deinit { detach() }
}
