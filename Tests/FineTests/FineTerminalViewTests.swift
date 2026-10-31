import AppKit
import GhosttyTerminal
import XCTest
@testable import Fine

final class FineTerminalLayoutTests: XCTestCase {
    /// Claude 탭: 보이는 칸은 셀 높이의 정수배, 표면은 한 줄 더 길다 — 마지막 줄(힌트)이 칸 밖에 놓인다.
    func testClaudeHintRowFallsOutsideTheVisibleArea() {
        let frames = FineTerminalView.layout(size: NSSize(width: 900, height: 620), cellHeight: 17,
                                             cropsFooterRow: true)
        let area = 620 - FineTerminalView.topInset - FineTerminalView.statusHeight - FineTerminalView.statusBottom
        XCTAssertEqual(frames.clip.height, (area / 17).rounded(.down) * 17)
        XCTAssertLessThanOrEqual(frames.clip.height, area)
        let surfaceRows = (frames.surface.height / 17).rounded(.down)
        XCTAssertEqual(surfaceRows, frames.clip.height / 17 + 1, "the surface must hold exactly one hidden row")
        XCTAssertEqual(frames.clip.minX, FineTerminalView.inlineInset)
        XCTAssertEqual(frames.clip.width, 900 - FineTerminalView.inlineInset * 2)
    }

    func testOtherHarnessesShowEveryRow() {
        let frames = FineTerminalView.layout(size: NSSize(width: 900, height: 620), cellHeight: 17,
                                             cropsFooterRow: false)
        XCTAssertEqual(frames.surface.size, frames.clip.size)
        XCTAssertEqual(frames.clip.maxY, 620 - FineTerminalView.statusHeight - FineTerminalView.statusBottom)
    }

    func testStatusRailSitsAboveTheBottomEdge() {
        let frames = FineTerminalView.layout(size: NSSize(width: 500, height: 300), cellHeight: 16,
                                             cropsFooterRow: true)
        XCTAssertEqual(frames.status, NSRect(x: 16, y: 300 - 8 - 20, width: 500 - 32, height: 20))
    }
}

final class TerminalStatusRailTests: XCTestCase {
    @MainActor
    func testClickOpensModelPicker() throws {
        let rail = TerminalStatusRail(text: "Kimi · k3 / effort high", isDark: false)
        rail.frame = NSRect(x: 0, y: 0, width: 300, height: 20)
        var clicks = 0
        rail.onClick = { clicks += 1 }
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 300, height: 20), styleMask: [.borderless],
                              backing: .buffered, defer: false)
        window.contentView?.addSubview(rail)
        let up = try XCTUnwrap(NSEvent.mouseEvent(
            with: .leftMouseUp, location: NSPoint(x: 40, y: 10), modifierFlags: [], timestamp: 0,
            windowNumber: window.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 0))
        rail.mouseUp(with: up)
        XCTAssertEqual(clicks, 1)
        XCTAssertEqual(rail.text, "Kimi · k3 / effort high")
    }
}

final class GhosttyLaunchCommandTests: XCTestCase {
    func testRemovedVariablesAreUnsetAndValuesStayOffTheCommandLine() throws {
        let base = ["PATH": "/usr/bin", "NO_COLOR": "1", "TMUX": "/tmp/t,1,0", "SECRET": "keep"]
        var environment = base
        environment.removeValue(forKey: "NO_COLOR")
        environment.removeValue(forKey: "TMUX")
        environment["FINE_TAB_ID"] = "abc"
        environment["PATH"] = "/opt/homebrew/bin:/usr/bin"
        let launch = TerminalSession.ghosttyLaunch(
            executable: "/bin/zsh", arguments: ["-ilc", "claude --resume 'x y'"],
            environment: environment, base: base, workingDirectory: "/tmp")
        let command = try XCTUnwrap(launch.command)
        XCTAssertEqual(command, "/usr/bin/env -u NO_COLOR -u TMUX /bin/zsh -ilc 'claude --resume '\\''x y'\\'''")
        XCTAssertEqual(launch.environment, ["FINE_TAB_ID": "abc", "PATH": "/opt/homebrew/bin:/usr/bin"])
        XCTAssertFalse(command.contains("keep"))
    }

    func testNothingToUnsetMeansNoEnvWrapper() {
        let launch = TerminalSession.ghosttyLaunch(
            executable: "/Applications/Fine.app/Contents/Helpers/FineAgent.app/Contents/MacOS/fine-agent",
            arguments: ["/bin/zsh", "-zsh", "-ilc", "claude"], environment: ["A": "1"], base: ["A": "1"],
            workingDirectory: "/tmp")
        XCTAssertEqual(launch.command,
                       "/Applications/Fine.app/Contents/Helpers/FineAgent.app/Contents/MacOS/fine-agent /bin/zsh -zsh -ilc claude")
        XCTAssertTrue(launch.environment.isEmpty)
    }
}

/// 실제 libghostty 표면으로 Fine 탭의 길을 끝까지 본다: 띄우기 → CLI 입력 → 화면 읽기 → 색 보고 → 닫기.
final class FineTerminalSurfaceTests: XCTestCase {
    @MainActor
    func testCliWriteReadAndThemeReportThroughARealSurface() throws {
        _ = NSApplication.shared
        try XCTSkipUnless(GhosttyRuntime.shared.isAvailable, "libghostty did not initialise")
        let view = FineTerminalView(palette: .quickDark, statusText: "test", harness: .codex, cropsFooterRow: false)
        defer { view.terminate(synchronously: true) }
        view.start(.init(command: "/bin/sh -c 'printf \"READY\\n\"; exec cat'", workingDirectory: NSHomeDirectory()))
        XCTAssertFalse(view.failedToStart)
        XCTAssertTrue(wait { view.readScreen(lines: 20)?.contains("READY") == true })
        XCTAssertTrue(view.write(Data("fine send 한글\r".utf8)))
        XCTAssertTrue(wait { (view.readScreen(lines: 20) ?? "").components(separatedBy: "fine send 한글").count == 3 },
                      view.readScreen(lines: 20) ?? "")

        let report = try XCTUnwrap(view.themeReport())
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(report.utf8)) as? [String: Any])
        XCTAssertEqual(json["background"] as? String, TerminalPalette.quickDark.colors["background"])
        XCTAssertEqual(json["engine"] as? String, "ghostty")
        view.apply(.quickLight)
        let light = try XCTUnwrap(view.themeReport())
        XCTAssertTrue(light.contains(TerminalPalette.quickLight.colors["background"]!), light)
    }

    /// 터미널 알림(OSC 9)이 탭까지 온다 — TerminalSession이 그것을 노치에 올린다.
    @MainActor
    func testTerminalNotificationReachesTheTab() throws {
        _ = NSApplication.shared
        try XCTSkipUnless(GhosttyRuntime.shared.isAvailable, "libghostty did not initialise")
        let view = FineTerminalView(palette: .quickDark, statusText: "test", harness: .claude, cropsFooterRow: true)
        defer { view.terminate(synchronously: true) }
        var notes: [String] = []
        view.onNotification = { notes.append("\($0)|\($1)") }
        view.start(.init(command: "/bin/sh -c 'sleep 0.2; printf \"\\033]9;답을 기다립니다\\007\"; sleep 5'",
                         workingDirectory: NSHomeDirectory()))
        XCTAssertTrue(wait { !notes.isEmpty }, "no notification")
        XCTAssertEqual(notes.first?.hasSuffix("|답을 기다립니다"), true, "\(notes)")
    }

    @MainActor
    private func wait(timeout: TimeInterval = 5, _ condition: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return true }
            RunLoop.main.run(until: Date().addingTimeInterval(0.02))
        }
        return condition()
    }
}
