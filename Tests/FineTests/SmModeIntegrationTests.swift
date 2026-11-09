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
        session.isVisible = true
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
        restored.isVisible = true
        restored.startImmediately()
        XCTAssertTrue(wait(30) { restored.terminalView?.isProcessRunning == true &&
            !(restored.terminalView?.readScreen(lines: 40) ?? "").isEmpty }, "did not reattach")
        XCTAssertEqual(row(name)?["hold"] as? String, holder, "a new agent was started instead of reattaching")

        // 탭 닫기: 에이전트가 실제로 끝난다.
        restored.cleanup(force: true)
        XCTAssertTrue(wait(25) { (self.row(name)?["status"] as? String) != "running" }, "closing the tab left the agent running")
    }

    /// 이 세션을 보는 attach 프로세스 수(attach 하나가 login 래퍼와 본체 둘로 보인다 — 있고 없음만 본다).
    private func attachClients(_ name: String) -> Int {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/pgrep")
        process.arguments = ["-f", "sm-session attach \(name) "]
        let pipe = Pipe()
        process.standardOutput = pipe
        try? process.run()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        return String(decoding: data, as: UTF8.self).split(separator: "\n").count
    }

    /// 보이는 탭만 붙는다: 가리면 attach가 내려가고 화면은 남는다. 다시 보이면 덮인 채 붙었다가 걷힌다.
    /// 밖에서 멈추면 어두운 막 + "멈춤" 글, 키를 누르면 깨어나 걷힌다.
    @MainActor
    func testOnlyTheVisibleTabAttachesAndAStoppedSessionWakesOnAKey() throws {
        _ = NSApplication.shared
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 900, height: 600), styleMask: [.titled],
                              backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false   // ARC가 해제한다 — close()가 한 번 더 해제하면 시험이 죽는다
        // 대화가 있어야 멈춘 뒤 되살릴 수 있다(빈 세션은 --resume할 대화가 없어 바로 끝난다).
        let session = TerminalSession(launch: .initialPrompt("- Fine 시험 탭이야. 아무 작업도 하지 말고 '확인'이라고만 답해."),
                                      configuration: .defaultConfiguration(for: .claude))
        let name = SmSessionBridge.name(for: session.id)
        defer { SmSessionBridge.stop(name); window.close() }
        session.isVisible = true
        session.startImmediately()
        let view = try XCTUnwrap(session.terminalView)
        view.frame = window.contentView!.bounds
        window.contentView!.addSubview(view)
        XCTAssertTrue(wait(45) { self.attachClients(name) > 0 && !(view.readScreen(lines: 40) ?? "").isEmpty },
                      "visible tab did not attach: clients=\(attachClients(name)) live=\(view.surface != nil) screen=\(view.readScreen(lines: 5) ?? "nil")")

        XCTAssertTrue(wait(60) { (view.readScreen(lines: 40) ?? "").contains("확인") }, "the first reply never came")
        // 잠깐 가렸다 돌아오면 붙은 그대로다 — 다시 붙지도, 덮이지도 않는다(11/09).
        session.isVisible = false
        RunLoop.main.run(until: Date().addingTimeInterval(1.5))
        XCTAssertGreaterThan(attachClients(name), 0, "a briefly hidden tab dropped its attach")
        session.isVisible = true
        XCTAssertFalse(view.stage.isCovered, "coming back to a briefly hidden tab covered it")

        // 가려진 탭은 유예(10분) 뒤에 내린다 — 시험에서는 바로.
        let grace = TerminalSession.lowerAfter
        TerminalSession.lowerAfter = 0
        defer { TerminalSession.lowerAfter = grace }
        session.isVisible = false
        XCTAssertTrue(wait(10) { self.attachClients(name) == 0 }, "hidden tab kept its attach")
        XCTAssertEqual(row(name)?["status"] as? String, "running", "hiding the tab ended the agent")
        XCTAssertTrue(view.stage.isCovered && view.stage.scene != nil, "hidden tab lost its last frame")

        session.isVisible = true
        XCTAssertTrue(view.stage.isCovered, "re-shown tab was not covered while attaching")
        XCTAssertTrue(wait(20) { !view.stage.isCovered && self.attachClients(name) > 0 }, "never revealed")
        XCTAssertFalse((view.readScreen(lines: 40) ?? "").isEmpty)

        // 밖에서 멈춤(sm stop): 덮이고 "멈춤", 저절로 깨지 않는다.
        let stop = Process()
        stop.executableURL = URL(fileURLWithPath: SmSessionBridge.executable!)
        stop.arguments = ["stop", name]
        try stop.run()
        XCTAssertTrue(wait(30) { view.stage.isCovered && view.stage.look == .dimmed && view.stage.caption != nil },
                      "a stopped session did not rest under the veil")
        // stop은 Claude가 SIGTERM을 무시해 몇 초 뒤 SIGKILL로 끝난다 — 끝난 뒤에 키를 누른다(사람이 누르는 때).
        XCTAssertTrue(wait(40) { !stop.isRunning }, "sm-session stop never returned")
        RunLoop.main.run(until: Date().addingTimeInterval(2))
        XCTAssertNotEqual(row(name)?["status"] as? String, "running", "a stopped session woke by itself")

        // 키 하나: 깨어나고, 걷히면 그 키가 들어간다.
        let key = try XCTUnwrap(NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: 0,
                                                 windowNumber: window.windowNumber, context: nil, characters: "x",
                                                 charactersIgnoringModifiers: "x", isARepeat: false, keyCode: 7))
        view.stage.keyDown(with: key)
        XCTAssertTrue(wait(60) { !view.stage.isCovered && self.row(name)?["status"] as? String == "running" },
                      "a key did not wake the stopped session")
        XCTAssertTrue(wait(10) { (view.readScreen(lines: 40) ?? "").contains("x") }, "the held key was lost: \(view.readScreen(lines: 12) ?? "nil") live=\(view.surface.map { "\($0.isProcessRunning)" } ?? "nil") responder=\(String(describing: window.firstResponder))")
        session.cleanup(force: true)
        XCTAssertTrue(wait(30) { (self.row(name)?["status"] as? String) != "running" })
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
        tab.isVisible = true
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
