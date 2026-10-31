import AppKit
import SwiftUI

enum AppTermination {
    static var isTerminating = false
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var controlServer: ControlServer?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        // 저장된 외형을 창이 뜨기 전에 건다. SwiftUI의 preferredColorScheme만으로는
        // AppKit이 그리는 창 테두리·재질이 따라오지 않는다.
        MainActor.assumeIsolated { FineAppearance.apply(.stored) }
        // 창은 이 시점 이후에 만들어진다. 한 번 더 맞춰야 첫 화면부터 저장된 외형이 된다.
        DispatchQueue.main.async {
            MainActor.assumeIsolated {
                FineAppearance.apply(.stored)
                // Prepare the user's home artwork after the first launch turn. Its
                // thumbnail then stays ready for the first light-to-dark switch.
                _ = HomeSceneImageStore.shared
            }
        }
        startControlServer()
        MainActor.assumeIsolated { AttentionNotch.shared.start() }
        requestAgentPermissions()
    }

    /// 탭 안 에이전트의 computer-use는 macOS가 Fine의 권한으로 판정한다. 빠져 있으면 시작할 때
    /// 시스템에 요청한다. macOS 27.2에서는 화면 녹화 요청이 창을 띄우지 않았다(2026-10-27) —
    /// 예전 서명에 묶인 항목이 남으면 `tccutil reset ScreenCapture com.seol.fine` 후 설정에서 직접 켠다.
    private func requestAgentPermissions() {
        if !CGPreflightScreenCaptureAccess() {
            _ = CGRequestScreenCaptureAccess()
        }
        let prompt = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        _ = AXIsProcessTrustedWithOptions([prompt: true] as CFDictionary)
    }

    /// `fine` CLI용 제어 소켓. 실패해도 앱은 정상 동작한다 — CLI만 쓸 수 없게 된다.
    private func startControlServer() {
        let server = ControlServer(path: ControlCommands.socketPath) { request, completion in
            MainActor.assumeIsolated { ControlCommands.handle(request, completion: completion) }
        }
        do {
            try server.start()
            controlServer = server
        } catch {
            NSLog("Fine control server failed to start: \(error)")
        }
    }

    func applicationShouldHandleReopen(
        _ sender: NSApplication,
        hasVisibleWindows flag: Bool
    ) -> Bool {
        if !flag { NSApp.windows.first?.makeKeyAndOrderFront(nil) }
        NSApp.activate(ignoringOtherApps: true)
        return true
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        controlServer?.stop()
        FineWindowRegistry.shared.persistWindowPresentations()
        AppTermination.isTerminating = true
        // 자식 정리를 여기서 동기적으로 끝낸다. .terminateNow 이후에는 비동기 승격이
        // 실행될 기회가 없어, 신호를 무시하는 자식이 launchd로 입양된 채 살아남는다.
        FineWindowRegistry.shared.cleanupAllSessions(synchronous: true)
        return .terminateNow
    }
}

@main
struct FineApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    init() {
        // 탭이 하나라도 뜨기 전에: 에이전트 셸에서 띄웠으면 그 세션의 정체를 지운다(InheritedAgentSession).
        let cleared = InheritedAgentSession.clear()
        if !cleared.isEmpty { NSLog("Fine: cleared inherited agent session variables: %@", cleared.joined(separator: " ")) }
    }

    var body: some Scene {
        WindowGroup(id: "main", for: UUID.self) { $windowStateID in
            ContentView(windowStateID: $windowStateID)
                .frame(minWidth: 760, minHeight: 520)
        }
        .windowStyle(.hiddenTitleBar)
        .commands { FineCommands() }
    }
}

struct FineCommands: Commands {
    @FocusedObject private var appState: AppState?
    @Environment(\.openWindow) private var openWindow

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("New Window") {
                openWindow(id: "main", value: UUID())
            }
            .keyboardShortcut("n", modifiers: .command)

            // 빈 탭을 만드는 대신 새 대화 화면으로 간다 — 거기서 하네스와 모델을
            // 고르고 시작하는 것이 이 앱에서 대화를 여는 방식이다.
            Button("New Conversation") {
                appState?.showHome()
            }
            .keyboardShortcut("t", modifiers: .command)
        }

        CommandGroup(after: .toolbar) {
            Button("홈 배경 고르기…") {
                appState?.showHome()
                appState?.isBackgroundPickerPresented = true
            }
            .keyboardShortcut("b", modifiers: [.command, .shift])
        }

        CommandMenu("Conversation") {
            Button("에이전트 알림") { AttentionNotch.shared.reveal(animated: false) }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            Button("Next Conversation") { appState?.selectNextSession() }
                .keyboardShortcut(.downArrow, modifiers: [.command])
            Button("Previous Conversation") { appState?.selectPreviousSession() }
                .keyboardShortcut(.upArrow, modifiers: [.command])
        }
    }
}

enum WindowRestorer {
    private static var didRun = false

    static func openRemainingWindowsIfNeeded(_ openWindow: OpenWindowAction) {
        guard !didRun else { return }
        didRun = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            for state in WindowStateStorage.shared.unclaimedStates() {
                openWindow(id: "main", value: state.id)
            }
        }
    }
}
