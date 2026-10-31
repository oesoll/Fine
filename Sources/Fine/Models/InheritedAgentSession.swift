import Foundation

/// Fine을 에이전트 셸에서 띄웠을 때(설치·재시작) 그 셸의 세션 정체를 앱 환경에서 지운다.
///
/// `open`도 호출한 셸의 환경을 앱에 넘긴다. 2026-10-31 에이전트가 설치 뒤 Fine을 다시 띄우자 탭 7개의
/// Claude가 모두 그 에이전트의 `PEER_NAME`·`SM_PANE_ID`·`CLAUDECODE`, 그리고 그 세션의 메시지 소켓과
/// 토큰(`CLAUDE_CODE_MESSAGING_*`)을 들고 떴다 — peer에서는 남의 이름으로 보이고, 남의 세션에 말을 걸 수 있었다.
///
/// 앱이 시작하자마자 지우므로 탭·모델 조회·찾기 등 Fine이 띄우는 모든 자식이 깨끗하다. 탭은 로그인 셸
/// (`zsh -ilc`)이 사용자 설정을 다시 읽으니, 사용자가 셸 설정에서 정한 값은 그대로 돌아온다.
/// Finder로 띄운 Fine에는 이 변수들이 처음부터 없다.
enum InheritedAgentSession {
    /// 세션 하나에만 속하는 변수. `CODEX_HOME`처럼 사용자 설정인 것은 건드리지 않는다.
    static func isSessionVariable(_ name: String) -> Bool {
        if ["CLAUDECODE", "CLAUDE_PID", "CLAUDE_EFFORT", "AI_AGENT", "SM_PANE_ID", "SM_WORKSPACE",
            "CODEX_THREAD_ID"].contains(name) { return true }
        return name.hasPrefix("CLAUDE_CODE_") || name.hasPrefix("PEER_") || name.hasPrefix("CODEX_SANDBOX")
    }

    static func sessionVariables(in environment: [String: String]) -> [String] {
        environment.keys.filter(isSessionVariable).sorted()
    }

    /// 이 프로세스 환경에서 지운다. 무엇을 지웠는지 돌려준다(진단용).
    /// unsetenv는 다른 스레드가 환경을 읽는 동안 부르면 안전하지 않다 — 앱 시작(스레드가 자식을 띄우기 전)에만 부른다.
    @discardableResult
    static func clear(environment: [String: String] = ProcessInfo.processInfo.environment,
                      unset: (String) -> Void = { unsetenv($0) }) -> [String] {
        let names = sessionVariables(in: environment)
        names.forEach(unset)
        return names
    }
}
