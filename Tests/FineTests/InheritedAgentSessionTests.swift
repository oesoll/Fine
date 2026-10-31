import XCTest
@testable import Fine

/// 에이전트 셸에서 띄운 Fine의 탭이 그 에이전트 행세를 하면 안 된다(2026-10-31 사고).
final class InheritedAgentSessionTests: XCTestCase {
    func testSessionIdentityIsClearedAndUserSettingsStay() {
        let inherited = [
            "CLAUDECODE": "1", "CLAUDE_CODE_MESSAGING_SOCKET": "/tmp/cc-socks/1.sock",
            "CLAUDE_CODE_MESSAGING_TOKEN": "t", "CLAUDE_CODE_CHILD_SESSION": "1", "CLAUDE_PID": "1",
            "PEER_NAME": "someone-else", "PEER_HOLD_SOCK": "/x.sock", "SM_PANE_ID": "p-1", "SM_WORKSPACE": "w",
            "AI_AGENT": "claude", "CODEX_SANDBOX": "seatbelt",
            "PATH": "/usr/bin", "HOME": "/Users/u", "CODEX_HOME": "/Users/u/.codex", "SHELL": "/bin/zsh",
        ]
        XCTAssertEqual(Set(InheritedAgentSession.sessionVariables(in: inherited)), [
            "CLAUDECODE", "CLAUDE_CODE_MESSAGING_SOCKET", "CLAUDE_CODE_MESSAGING_TOKEN",
            "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_PID", "PEER_NAME", "PEER_HOLD_SOCK", "SM_PANE_ID",
            "SM_WORKSPACE", "AI_AGENT", "CODEX_SANDBOX",
        ])
    }

    /// 실제 프로세스 환경은 건드리지 않는다 — 시험 중에는 다른 시험의 터미널 스레드가 환경을 읽고 있다.
    func testClearUnsetsExactlyTheSessionVariables() {
        var unset: [String] = []
        let cleared = InheritedAgentSession.clear(
            environment: ["PEER_NAME": "x", "CLAUDE_CODE_MESSAGING_TOKEN": "t", "PATH": "/usr/bin"],
            unset: { unset.append($0) })
        XCTAssertEqual(cleared, ["CLAUDE_CODE_MESSAGING_TOKEN", "PEER_NAME"])
        XCTAssertEqual(unset, cleared)
    }
}
