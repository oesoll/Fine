import XCTest
@testable import Fine

/// sm 모드: Fine 탭의 에이전트를 sm 세션으로 띄우는 인자가 맞는지(실제 sm-session은 부르지 않는다).
final class SmSessionBridgeTests: XCTestCase {
    private let tab = UUID(uuidString: "1A2B3C4D-0000-4000-8000-000000000001")!

    func testNameComesFromTheTabAndIsStable() {
        XCTAssertEqual(SmSessionBridge.name(for: tab), "fine-1a2b3c4d")
    }

    func testClaudeTabSpawnsThroughCcvWithFinesFlags() throws {
        try XCTSkipUnless(QuickSessionPolicy.usesCcvWrapper, "ccv not installed here")
        let configuration = QuickSessionConfiguration.defaultConfiguration(for: .claude)
        let blank = try XCTUnwrap(SmSessionBridge.spawn(name: "fine-1a2b3c4d", tabID: tab, launch: .initialPrompt("안녕"),
                                                       configuration: configuration, workingDirectory: "/tmp",
                                                       path: "/usr/bin:/bin"))
        XCTAssertEqual(blank.kind, "claude")
        XCTAssertEqual(blank.args, ["-y", "--", "안녕"])
        XCTAssertEqual(blank.env["FINE_TAB_ID"], tab.uuidString.lowercased())
        XCTAssertEqual(blank.env["PEER_WRAPPER"], QuickSessionPolicy.ccvExecutablePath)
        XCTAssertEqual(blank.env["CLAUDE_CODE_FORCE_SESSION_PERSISTENCE"], "1")
        XCTAssertTrue(blank.env["PATH"]?.hasPrefix((QuickSessionPolicy.ccvExecutablePath as NSString).deletingLastPathComponent) == true)
        XCTAssertNil(blank.env["PEER_NAME"])   // sm-session이 정한다(--env로는 못 넘긴다)
        XCTAssertTrue(blank.env["LANG"]?.hasSuffix("UTF-8") == true)

        let chosen = QuickSessionConfiguration(harness: .claude, modelID: "claude-opus-5-5", effort: .high,
                                               proxyEnabled: false)
        let resumed = try XCTUnwrap(SmSessionBridge.spawn(name: "fine-1a2b3c4d", tabID: tab,
                                                         launch: .resume(sessionId: "abc"), configuration: chosen,
                                                         workingDirectory: "/tmp", path: ""))
        XCTAssertEqual(resumed.args.prefix(2), ["-ry", "abc"])
        XCTAssertTrue(resumed.args.contains("--model") && resumed.args.contains("claude-opus-5-5"))
        let arguments = resumed.arguments
        XCTAssertEqual(Array(arguments.prefix(4)), ["spawn", "fine-1a2b3c4d", "--kind", "claude"])
        XCTAssertEqual(arguments.drop { $0 != "--" }.dropFirst().first, "-ry")
    }

    func testCodexAndOtherEngines() throws {
        let codex = try XCTUnwrap(SmSessionBridge.spawn(name: "n", tabID: tab, launch: .blank,
                                                       configuration: .defaultConfiguration(for: .codex),
                                                       workingDirectory: "/tmp", path: ""))
        XCTAssertEqual(codex.kind, "codex")
        XCTAssertEqual(codex.args, ["-y"])
        // "마지막 대화 이어서"는 sm 세션으로 표현할 수 없다 — 그 탭은 직접 띄운다.
        XCTAssertNil(SmSessionBridge.spawn(name: "n", tabID: tab, launch: .resumeLatest,
                                           configuration: .defaultConfiguration(for: .codex), workingDirectory: "/tmp",
                                           path: ""))
        let opencode = try XCTUnwrap(SmSessionBridge.spawn(name: "n", tabID: tab, launch: .blank,
                                                          configuration: .defaultConfiguration(for: .opencode),
                                                          workingDirectory: "/tmp", path: ""))
        XCTAssertEqual(opencode.kind, "shell")
        XCTAssertEqual(Array(opencode.args.prefix(2)), ["-i", "-c"])
        XCTAssertTrue(opencode.args[2].contains("$FINE_OPENCODE"))
        XCTAssertNotNil(opencode.env["FINE_OPENCODE"])
    }

    func testListRowsCarryTheConversation() {
        let rows = SmSessionBridge.parseRows("""
        {"sessions": [{"name": "fine-1a2b3c4d", "status": "running", "kind": "claude", "session": "s-1"},
                      {"name": "dev", "status": "ended", "kind": "shell", "session": null}], "host": "mac"}
        """)
        XCTAssertEqual(rows, [
            .init(name: "fine-1a2b3c4d", status: "running", kind: "claude", session: "s-1"),
            .init(name: "dev", status: "ended", kind: "shell", session: nil),
        ])
    }

    /// 다시 띄운 Fine이 같은 세션에 다시 붙으려면 탭 상태에 이름이 남아야 한다. 예전 상태 파일도 읽혀야 한다.
    func testSnapshotKeepsTheSessionAndReadsOldFiles() throws {
        let session = TerminalSession(attaching: "docs-writer", harness: .claude)
        let snapshot = session.snapshot()
        XCTAssertEqual(snapshot.smSessionName, "docs-writer")
        let decoded = try JSONDecoder().decode(QuickSessionSnapshot.self, from: JSONEncoder().encode(snapshot))
        XCTAssertEqual(TerminalSession(snapshot: decoded).smSessionName, "docs-writer")

        let old = #"{"id":"1A2B3C4D-0000-4000-8000-000000000001","name":"x","configuration":{"harness":"claude","modelID":"","effort":"high","proxyEnabled":false}}"#
        if let decodedOld = try? JSONDecoder().decode(QuickSessionSnapshot.self, from: Data(old.utf8)) {
            XCTAssertNil(decodedOld.smSessionName)
        }
    }
    @MainActor
    func testClosingHeldTabStopsTheSessionButQuittingPreservesIt() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let command = directory.appendingPathComponent("sm-session")
        let log = directory.appendingPathComponent("calls")
        try "#!/bin/sh\nprintf '%s\\n' \"$*\" >> '\(log.path)'\n".write(to: command, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: command.path)
        let previous = ProcessInfo.processInfo.environment["FINE_SM_SESSION"]
        setenv("FINE_SM_SESSION", command.path, 1)
        defer {
            if let previous { setenv("FINE_SM_SESSION", previous, 1) } else { unsetenv("FINE_SM_SESSION") }
        }
        for force in [false, true] {
            let tab = TerminalSession(attaching: "shared-agent", harness: .claude)
            tab.cleanup(force: force)
            XCTAssertEqual(tab.smSessionName, "shared-agent")
        }
        let quitTab = TerminalSession(attaching: "kept-on-quit", harness: .claude)
        quitTab.cleanupForTermination()
        let deadline = Date().addingTimeInterval(5)
        while Date() < deadline {
            let calls = (try? String(contentsOf: log, encoding: .utf8)) ?? ""
            if calls.split(separator: "\n").count >= 2 { break }
            RunLoop.main.run(until: Date().addingTimeInterval(0.05))
        }
        let calls = try String(contentsOf: log, encoding: .utf8).split(separator: "\n").map(String.init)
        XCTAssertEqual(calls, ["stop shared-agent", "stop shared-agent"])

    }

}
