import AppKit
import GhosttyTerminal
import XCTest
@testable import Fine

/// sm 모드를 실제 sm-session으로 끝까지: 띄우기 → 앱 종료(세션은 산다) → 다시 붙기(같은 holder) → 탭 닫기(끝남),
/// 그리고 sm에서 옮겨 온 세션 붙기 · sm으로 옮기기. 진짜 Claude 세션을 Fine의 기본 작업 폴더에 띄우므로 켤 때만 돈다:
/// `CLAUDE_CODE_NO_FLICKER=0 FINE_SM_INTEGRATION=1 FINE_SM_SESSION=~/.smux/bin/sm-session FINE_SM_CLI=<reveal을 적는 가짜> swift test --filter SmMode`
///
/// `CLAUDE_CODE_NO_FLICKER=0`이 꼭 있어야 한다: Claude Code는 fullscreen으로 뜬 세션이 건강해지기(약 10초) 전에
/// 죽으면 실패로 세고, 두 번이면 그 기계 전체의 fullscreen을 끈다(~/.claude.json `fullscreenAutoDisabled`).
/// 이 시험은 세션을 몇 초 만에 끄므로, 0 없이 돌리면 그 뒤 모든 새 세션이 classic 렌더러로 뜬다(2026-11-01에 실제로 그랬다).
final class SmModeIntegrationTests: XCTestCase {
    override func setUpWithError() throws {
        let env = ProcessInfo.processInfo.environment
        try XCTSkipUnless(env["FINE_SM_INTEGRATION"] == "1" && SmSessionBridge.isAvailable,
                          "set FINE_SM_INTEGRATION=1 and FINE_SM_SESSION")
        try XCTSkipUnless(env["CLAUDE_CODE_NO_FLICKER"] == "0",
                          "set CLAUDE_CODE_NO_FLICKER=0 — otherwise the quick stops turn fullscreen off machine-wide")
    }

    private func row(_ name: String) -> [String: Any]? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: SmSessionBridge.executable!)
        process.arguments = ["ls", "--json"]
        let pipe = Pipe()
        process.standardOutput = pipe
        try? process.run()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        return (json?["sessions"] as? [[String: Any]])?.first { $0["name"] as? String == name }
    }

    @MainActor
    private func wait(_ timeout: TimeInterval, _ condition: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return true }
            RunLoop.main.run(until: Date().addingTimeInterval(0.25))
        }
        return condition()
    }

    @MainActor
    func testHeldTabSurvivesQuitReattachesAndEndsOnClose() throws {
        _ = NSApplication.shared
        let session = TerminalSession(launch: .blank, configuration: .defaultConfiguration(for: .claude))
        let name = SmSessionBridge.name(for: session.id)
        defer { SmSessionBridge.stop(name) }
        session.startImmediately()
        XCTAssertTrue(wait(45) { self.row(name)?["status"] as? String == "running" }, "sm session never ran")
        XCTAssertEqual(session.smSessionName, name)
        XCTAssertTrue(wait(30) { !(session.terminalView?.readScreen(lines: 40) ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty },
                      "attached surface shows nothing")
        let holder = try XCTUnwrap(row(name)?["hold"] as? String)

        // 앱 종료: 떼기만 한다.
        session.cleanupForTermination()
        RunLoop.main.run(until: Date().addingTimeInterval(2))
        XCTAssertEqual(row(name)?["status"] as? String, "running", "quitting Fine ended the agent")

        // 다시 띄운 Fine: 같은 이름으로 같은 holder에 붙는다(새 에이전트가 아니다).
        let restored = TerminalSession(snapshot: session.snapshot())
        restored.startImmediately()
        XCTAssertTrue(wait(30) { restored.terminalView?.isProcessRunning == true &&
            !(restored.terminalView?.readScreen(lines: 40) ?? "").isEmpty }, "did not reattach")
        XCTAssertEqual(row(name)?["hold"] as? String, holder, "a new agent was started instead of reattaching")

        // 탭 닫기: 에이전트가 실제로 끝난다.
        restored.cleanup(force: true)
        XCTAssertTrue(wait(25) { (self.row(name)?["status"] as? String) != "running" }, "closing the tab left the agent running")
    }

    @MainActor
    func testAttachFromSmAndHandOffBack() throws {
        _ = NSApplication.shared
        let name = "fine-itest-" + UUID().uuidString.prefix(6).lowercased()
        let spawn = SmSessionBridge.Spawn(name: name, kind: "claude", cwd: QuickSessionPolicy.ensureWorkingDirectory(),
                                          env: ["PEER_WRAPPER": QuickSessionPolicy.ccvExecutablePath,
                                                                "CLAUDE_CODE_NO_FLICKER": "0"], args: ["-y"])
        try SmSessionBridge.run(spawn, environment: ProcessInfo.processInfo.environment,
                                executable: SmSessionBridge.executable!)
        defer { SmSessionBridge.stop(name) }

        let tab = TerminalSession(attaching: name, harness: .claude)
        tab.startImmediately()
        XCTAssertTrue(wait(30) { !(tab.terminalView?.readScreen(lines: 40) ?? "").isEmpty }, "attach showed nothing")

        // sm으로 옮기기: 탭만 떨어지고 세션은 산다. reveal이 불린다(가짜 sm CLI가 적어 둔다).
        XCTAssertEqual(tab.detachForHandoff(), name)
        SmSessionBridge.reveal(name)
        RunLoop.main.run(until: Date().addingTimeInterval(2))
        XCTAssertEqual(row(name)?["status"] as? String, "running", "handing off ended the agent")
        if let log = ProcessInfo.processInfo.environment["FINE_SM_CLI_LOG"] {
            XCTAssertTrue(wait(5) { ((try? String(contentsOfFile: log, encoding: .utf8)) ?? "").contains("reveal \(name)") },
                          "sm reveal was not called")
        }
    }
}
