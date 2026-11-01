import Foundation

/// Fine의 "sm 모드": 이 맥에 sm 세션 층(`~/.smux/bin/sm-session`)이 있으면 탭의 에이전트를 sm 세션으로 띄운다.
///
/// 직접 띄운 에이전트는 Fine 프로세스에 묶여, Fine을 다시 띄우거나 재부팅하면 대화가 끊겼다. sm 세션은
/// 자기 holder(peer-hold)가 붙잡고 있어 Fine이 내려가도 살고, 재부팅 뒤엔 로그인 때 `sm restore`가 되살린다.
/// Fine 탭은 그 세션을 `sm-session attach`로 보는 화면이 된다. 그래서 같은 세션을 sm 패널로 옮기거나
/// 거꾸로 가져오는 것은 "어느 앱이 붙어 있느냐"만 바뀌는 일이다.
///
/// 탭 닫기·앱 종료는 화면만 뗀다. 에이전트를 끝내는 명시적 명령은 `sm stop NAME`이다.
/// sm 세션 층이 없는 기계(공개 Fine)는 지금처럼 직접 띄우고 탭과 함께 종료한다.
enum SmSessionBridge {
    /// sm 세션 층의 실행 파일. `FINE_SM_SESSION`으로 바꾸거나(시험) `FINE_SM_MODE=0`으로 끈다.
    static var executable: String? {
        let env = ProcessInfo.processInfo.environment
        if env["FINE_SM_MODE"] == "0" { return nil }
        // 시험 프로세스는 sm 세션(진짜 에이전트)을 띄우지 않는다. sm 모드를 시험할 때만 FINE_SM_SESSION으로 켠다.
        if NSClassFromString("XCTestCase") != nil, env["FINE_SM_SESSION"] == nil { return nil }
        let path = env["FINE_SM_SESSION"] ?? FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".smux/bin/sm-session").path
        return FileManager.default.isExecutableFile(atPath: path) ? path : nil
    }

    static var isAvailable: Bool { executable != nil }

    /// SpaceManager 앱의 CLI(`sm reveal`). sm 쪽으로 옮길 때 그 세션을 sm 화면 앞으로 부른다.
    static var smCLI: String? {
        let env = ProcessInfo.processInfo.environment
        if let path = env["FINE_SM_CLI"] { return FileManager.default.isExecutableFile(atPath: path) ? path : nil }
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return [home + "/bin/sm", "/opt/homebrew/bin/sm", "/usr/local/bin/sm"]
            .first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    /// Fine이 만든 세션의 이름. 탭 UUID에서 와서 Fine을 다시 띄워도 같은 세션을 찾는다. peer 이름도 이것이고,
    /// peer 목록·`peer say`에는 Fine 탭 제목이 title로 함께 걸린다(하네스가 맞춰 둠).
    static func name(for tabID: UUID) -> String {
        "fine-" + tabID.uuidString.lowercased().prefix(8)
    }

    struct Spawn: Equatable {
        var name: String
        var kind: String
        var cwd: String
        /// 세션 기록에 남아 재부팅 뒤 되살릴 때도 쓰이는 환경. 값만 넘기고 비밀은 넣지 않는다.
        var env: [String: String]
        /// ccv/ccx(또는 셸)에 그대로 가는 인자.
        var args: [String]

        var arguments: [String] {
            ["spawn", name, "--kind", kind, "--cwd", cwd, "--timeout", "3", "--json"]
                + env.keys.sorted().flatMap { ["--env", "\($0)=\(env[$0] ?? "")"] }
                + ["--"] + args
        }
    }

    /// 이 탭을 어떤 sm 세션으로 띄울지. sm 세션으로 띄울 수 없는 경우(Codex의 "마지막 대화 이어서")는 nil —
    /// 그 탭은 직접 띄운다.
    static func spawn(
        name: String,
        tabID: UUID,
        launch: QuickLaunch,
        configuration: QuickSessionConfiguration,
        workingDirectory: String,
        path: String
    ) -> Spawn? {
        var env = QuickSessionPolicy.environment(for: launch, configuration: configuration)
        env["FINE_TAB_ID"] = tabID.uuidString.lowercased()   // sm-session where가 Fine 탭을 찾는 고리
        env["CLAUDE_CODE_FORCE_SESSION_PERSISTENCE"] = "1"
        env["COLORTERM"] = "truecolor"
        // 직접 띄울 때는 로그인 셸이 채우던 값. 깨끗하게 띄운 Fine에는 LANG이 없어, 그대로 두면 세션이 C 로캘로 돈다.
        let inherited = ProcessInfo.processInfo.environment
        env["LANG"] = inherited["LANG"] ?? "\(Locale.current.identifier).UTF-8"
        // 사용자가 Fine에 준 렌더러 선택은 탭에도(시험은 0으로 fullscreen 판정을 건드리지 않는다 — 시험 파일 참고).
        if let renderer = inherited["CLAUDE_CODE_NO_FLICKER"] { env["CLAUDE_CODE_NO_FLICKER"] = renderer }
        // 깨끗하게 띄운 Fine의 PATH에는 ccv·ccx(~/myworld)가 없다. 런처 폴더를 앞에 둔다.
        let launcherDirectory = (QuickSessionPolicy.ccvExecutablePath as NSString).deletingLastPathComponent
        env["PATH"] = ([launcherDirectory] + path.split(separator: ":").map(String.init))
            .reduce(into: [String]()) { if !$1.isEmpty && !$0.contains($1) { $0.append($1) } }
            .joined(separator: ":")
        let model = !configuration.isDefaultModel
        switch configuration.harness {
        case .claude:
            guard QuickSessionPolicy.usesCcvWrapper else { return nil }
            env["PEER_WRAPPER"] = QuickSessionPolicy.ccvExecutablePath   // peer-session이 이 경로로 ccv를 띄운다
            var args: [String]
            switch launch {
            case .resume(let id): args = ["-ry", id]
            case .resumeLatest: args = ["-y", "--continue"]
            case .blank, .initialPrompt: args = ["-y"]
            }
            if model { args += ["--model", configuration.modelID, "--effort", configuration.effort.rawValue] }
            // `--`: "-"로 시작하는 프롬프트를 claude가 옵션으로 읽고 끝나지 않게.
            if case .initialPrompt(let prompt) = launch { args += ["--", prompt] }
            return Spawn(name: name, kind: "claude", cwd: workingDirectory, env: env, args: args)
        case .codex:
            var args: [String]
            switch launch {
            case .resume(let id): args = ["-ry", id]
            case .resumeLatest: return nil
            case .blank, .initialPrompt:
                args = ["-y"]
                if model { args += ["-m", configuration.modelID, "-c", "model_reasoning_effort=\(configuration.effort.rawValue)"] }
                if case .initialPrompt(let prompt) = launch { args += ["--", prompt] }
            }
            return Spawn(name: name, kind: "codex", cwd: workingDirectory, env: env, args: args)
        case .opencode, .omp:
            // sm 세션 종류에 없는 엔진은 셸 세션에 Fine의 명령을 싣는다. -i: 제공자 키가 ~/.zshrc에 있다.
            let command = QuickSessionPolicy.launchCommand(for: launch, configuration: configuration)
            return Spawn(name: name, kind: "shell", cwd: workingDirectory, env: env, args: ["-i", "-c", command])
        }
    }

    /// 표면이 띄울 명령: 그 세션을 이 화면에 붙인다(끝나 있으면 sm-session이 먼저 되살리고, 잠들어 있으면 깨운다).
    /// `--no-screen`: 끝난 세션의 저장 화면을 attach가 칠하지 않는다 — 마지막 장면은 Fine이 덮개로 보인다.
    /// 깨어 있는 세션이면 지금 화면은 그대로 칠해진다(11/01 확인).
    static func attachCommand(_ name: String, executable: String) -> String {
        [executable, "attach", name, "--no-screen"].map(TerminalSession.shellQuoted).joined(separator: " ")
    }

    /// 화면이 보여야 할 세션 상태: asleep | stopped | waking | ready | tmux | gone. 블로킹(약 0.15초).
    static func state(_ name: String) -> String? {
        guard let executable,
              let result = try? invoke(executable, ["state", name, "--json"],
                                       environment: ProcessInfo.processInfo.environment, timeout: 10),
              result.status == 0 else { return nil }
        return parseState(result.output)
    }

    static func parseState(_ line: String) -> String? {
        guard let data = line.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return json["state"] as? String
    }

    /// 세션이 끝날 때 남긴 마지막 화면 바이트(앱을 다시 켜 프레임이 없을 때 장면을 만든다). 블로킹.
    static func screen(_ name: String) -> Data? {
        guard let executable,
              let result = try? invokeData(executable, ["screen", name], timeout: 10),
              result.status == 0, !result.output.isEmpty else { return nil }
        return result.output
    }

    /// 화면에 보이는 동안의 세션 상태(`sm-session state NAME --watch --json`). 바뀔 때와 20초마다 한 줄.
    final class StateWatch {
        private let process = Process()
        private var buffer = Data()

        init?(name: String, onState: @escaping (String) -> Void) {
            guard let executable = SmSessionBridge.executable else { return nil }
            process.executableURL = URL(fileURLWithPath: executable)
            process.arguments = ["state", name, "--watch", "--json"]
            process.standardInput = FileHandle.nullDevice
            process.standardError = FileHandle.nullDevice
            let pipe = Pipe()
            process.standardOutput = pipe
            pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
                let chunk = handle.availableData
                guard let self else { return }
                guard !chunk.isEmpty else { handle.readabilityHandler = nil; return }
                self.buffer.append(chunk)
                while let newline = self.buffer.firstIndex(of: UInt8(ascii: "\n")) {
                    let line = String(decoding: self.buffer[self.buffer.startIndex..<newline], as: UTF8.self)
                    self.buffer.removeSubrange(self.buffer.startIndex...newline)
                    if let state = SmSessionBridge.parseState(line) {
                        DispatchQueue.main.async { onState(state) }
                    }
                }
            }
            do { try process.run() } catch { return nil }
        }

        func stop() {
            (process.standardOutput as? Pipe)?.fileHandleForReading.readabilityHandler = nil
            if process.isRunning { process.terminate() }
        }

        deinit { stop() }
    }

    /// 보이지 않는 탭의 화면 글(`fine read`) — 그 탭은 붙어 있지 않다.
    static func tail(_ name: String, lines: Int) -> String? {
        guard let executable,
              let result = try? invoke(executable, ["tail", name, "--lines", String(lines)],
                                       environment: ProcessInfo.processInfo.environment, timeout: 10),
              result.status == 0 else { return nil }
        return result.output
    }

    struct Failure: Error, CustomStringConvertible {
        let description: String
    }

    /// 세션을 띄운다(이미 돌고 있으면 그대로, 끝나 있으면 되살린다). 블로킹 — 메인 스레드에서 부르지 않는다.
    static func run(_ spawn: Spawn, environment: [String: String], executable: String) throws {
        let result = try invoke(executable, spawn.arguments, environment: environment, timeout: 40)
        guard result.status == 0 else {
            throw Failure(description: result.error.isEmpty ? "sm-session spawn 실패" : result.error)
        }
    }

    /// 에이전트를 명시적으로 끝낸다. 탭 닫기와 별개이며, 기다리지 않는다.
    static func stop(_ name: String) {
        guard let executable else { return }
        DispatchQueue.global(qos: .utility).async {
            _ = try? invoke(executable, ["stop", name], environment: ProcessInfo.processInfo.environment, timeout: 20)
        }
    }

    struct Row: Equatable {
        var name: String
        var status: String
        var kind: String?
        var session: String?
    }

    /// `sm-session ls --json`의 행. 블로킹.
    static func rows() -> [Row] {
        guard let executable,
              let result = try? invoke(executable, ["ls", "--json"], environment: ProcessInfo.processInfo.environment,
                                       timeout: 10),
              result.status == 0 else { return [] }
        return parseRows(result.output)
    }

    static func parseRows(_ output: String) -> [Row] {
        guard let data = output.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) else { return [] }
        let list = (json as? [[String: Any]]) ?? ((json as? [String: Any])?["sessions"] as? [[String: Any]]) ?? []
        return list.compactMap { row in
            guard let name = row["name"] as? String else { return nil }
            let session = (row["session"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            return Row(name: name, status: row["status"] as? String ?? "", kind: row["kind"] as? String, session: session)
        }
    }

    /// 그 세션을 sm 화면 앞으로(어느 패널에도 없으면 sm이 새 탭에 붙인다). 기다리지 않는다.
    static func reveal(_ name: String) {
        guard let cli = smCLI else { return }
        DispatchQueue.global(qos: .userInitiated).async {
            _ = try? invoke(cli, ["reveal", name], environment: ProcessInfo.processInfo.environment, timeout: 20)
        }
    }

    private static func invokeData(_ executable: String, _ arguments: [String],
                                   timeout: TimeInterval) throws -> (status: Int32, output: Data) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardInput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        let out = Pipe()
        process.standardOutput = out
        try process.run()
        var output = Data()
        let read = DispatchSemaphore(value: 0)
        DispatchQueue.global().async { output = out.fileHandleForReading.readDataToEndOfFile(); read.signal() }
        if read.wait(timeout: .now() + timeout) == .timedOut {
            process.terminate()
            throw Failure(description: "sm-session \(arguments.first ?? "") 시간 초과")
        }
        process.waitUntilExit()
        return (process.terminationStatus, output)
    }

    private static func invoke(_ executable: String, _ arguments: [String], environment: [String: String],
                               timeout: TimeInterval) throws -> (status: Int32, output: String, error: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.environment = environment
        let out = Pipe(), err = Pipe()
        process.standardOutput = out
        process.standardError = err
        process.standardInput = FileHandle.nullDevice
        try process.run()
        // 출력은 뒤에서 읽는다 — 파이프가 차서 멈추지 않게, 그리고 시간 제한이 읽기에 막히지 않게.
        var output = Data(), error = Data()
        let reads = DispatchGroup()
        reads.enter()
        DispatchQueue.global().async { output = out.fileHandleForReading.readDataToEndOfFile(); reads.leave() }
        reads.enter()
        DispatchQueue.global().async { error = err.fileHandleForReading.readDataToEndOfFile(); reads.leave() }
        let exited = DispatchSemaphore(value: 0)
        DispatchQueue.global().async { process.waitUntilExit(); exited.signal() }
        if exited.wait(timeout: .now() + timeout) == .timedOut {
            process.terminate()
            _ = exited.wait(timeout: .now() + 2)
            throw Failure(description: "\((executable as NSString).lastPathComponent) \(arguments.first ?? "") 시간 초과")
        }
        _ = reads.wait(timeout: .now() + 2)
        return (process.terminationStatus,
                String(decoding: output, as: UTF8.self),
                String(decoding: error, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines))
    }
}
