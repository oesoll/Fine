import Combine
import Foundation
import GhosttyTerminal

/// One ephemeral agent conversation backed by a libghostty surface (FineTerminalView).
/// The surface owns the PTY and the child process; this object decides what to launch.
final class TerminalSession: Identifiable, ObservableObject, Equatable {
    let id: UUID
    private(set) var controlFingerprint = UUID().uuidString
    @Published var name: String
    /// 묶인 메인 탭. 한 단만 — 하위 탭 아래에 또 묶지 않는다(AppState.normalizeGroups).
    @Published var parentID: UUID?
    /// 사용자가 직접 지은 이름인가. 하네스가 만든 제목이 이것을 덮지 않는다.
    @Published private(set) var isNameUserSet = false
    @Published var isRunning = false
    @Published var startError: String?
    @Published var isModelPickerPresented = false

    let launch: QuickLaunch
    let configuration: QuickSessionConfiguration
    private let initialName: String
    private(set) var terminalView: FineTerminalView?
    private var started = false
    private var sessionId: String?
    private var identityTimer: Timer?
    private var titleCancellable: AnyCancellable?
    private let configurationStorage: QuickSessionConfigurationStorage
    private var persistenceHandler: (() -> Void)?
    private var identityStartedAt = Date()
    private var metadataGeneration = UUID()
    private var metadataRefreshInFlight = false
    private let metadataQueue = DispatchQueue(label: "Fine.SessionMetadata", qos: .utility)

    var resumableSessionID: String? { sessionId }
    var currentLaunch: QuickLaunch {
        if configuration.harness == .codex, let sessionId { return .resume(sessionId: sessionId) }
        return launch
    }

    init(
        id: UUID = UUID(),
        name: String = QuickSessionPolicy.initialSessionName,
        launch: QuickLaunch = .blank,
        configuration: QuickSessionConfiguration = .default,
        configurationStorage: QuickSessionConfigurationStorage = .shared
    ) {
        self.id = id
        self.name = name
        self.initialName = name
        self.launch = launch
        self.configuration = configuration
        self.configurationStorage = configurationStorage
        if case .resume(let sessionId) = launch {
            self.sessionId = sessionId
        }
    }

    convenience init(
        snapshot: QuickSessionSnapshot,
        configurationStorage: QuickSessionConfigurationStorage = .shared
    ) {
        // 대화 ID가 있으면 그 대화를 정확히 이어 연다.
        // 없으면 빈 대화로 연다 — `.resumeLatest`는 "가장 최근 대화"를 집어오므로,
        // 여러 탭이 복구될 때 서로 같은 대화를 열어 중복이 된다.
        self.init(
            id: snapshot.id,
            name: snapshot.name,
            launch: snapshot.conversationID.map { .resume(sessionId: $0) } ?? .blank,
            configuration: snapshot.configuration,
            configurationStorage: configurationStorage
        )
        isNameUserSet = snapshot.isNameUserSet ?? false
        parentID = snapshot.parentID
    }

    func snapshot() -> QuickSessionSnapshot {
        QuickSessionSnapshot(
            id: id,
            name: name,
            conversationID: sessionId,
            configuration: configuration,
            isNameUserSet: isNameUserSet ? true : nil,
            parentID: parentID
        )
    }

    /// 사용자가 붙인 이름. 하네스가 만든 제목이 이것을 덮지 않는다 —
    /// 직접 지은 이름이 대화 몇 번에 사라지면 다시 짓지 않게 된다.
    func rename(to newName: String) {
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != name else { return }
        name = trimmed
        isNameUserSet = true
        persistenceHandler?()
    }

    /// 자동 제목으로 되돌린다.
    func clearCustomName() {
        isNameUserSet = false
        persistenceHandler?()
    }

    func setPersistenceHandler(_ handler: @escaping () -> Void) {
        persistenceHandler = handler
    }

    func getOrCreateTerminal() -> FineTerminalView {
        if let terminalView { return terminalView }
        let view = FineTerminalView(
            // 터미널은 UI에서만 만들어진다. 외형 조회는 메인 액터에 묶여 있다.
            palette: MainActor.assumeIsolated { TerminalPalette.current(configuration.harness) },
            statusText: configuration.terminalStatus,
            harness: configuration.harness,
            // OpenCode draws its own input and status rows at the bottom; only
            // Claude Code's hint row is replaced by Fine's status rail.
            cropsFooterRow: configuration.harness == .claude
        )
        view.translatesAutoresizingMaskIntoConstraints = false
        view.onStatusClick = { [weak self] in
            DispatchQueue.main.async {
                self?.isModelPickerPresented = true
            }
        }
        view.onExit = { [weak self] in
            DispatchQueue.main.async { self?.isRunning = false }
        }
        terminalView = view
        return view
    }

    /// 터미널과 자식 프로세스를 함께 띄운다. 화면에 아직 붙지 않은 탭(복원된 뒷탭)도 지금 띄운다 —
    /// 표면은 창 밖에서도 돌고, 마지막으로 잰 터미널 크기로 시작한다.
    func startImmediately() {
        _ = getOrCreateTerminal()
        startIfNeeded()
    }

    private func startIfNeeded() {
        guard !started else { return }
        started = true
        startProcess()
    }

    private func startProcess() {
        controlFingerprint = UUID().uuidString
        identityStartedAt = Date()
        let shell = ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
        let executableName = "-" + (shell as NSString).lastPathComponent
        let directory = QuickSessionPolicy.ensureWorkingDirectory()
        // Pin a restored "latest" launch before starting the CLI so title lookup
        // and the actual resume command use exactly the same conversation.
        let effectiveLaunch = HarnessSessionStore.local.resolvingLatest(
            currentLaunch, harness: configuration.harness, workingDirectory: directory
        )
        if case .resume(let id) = effectiveLaunch { sessionId = id }
        let base = ProcessInfo.processInfo.environment
        var environment = base
        environment["TERM"] = "xterm-256color"
        environment["COLORTERM"] = "truecolor"
        // Fine은 색을 그리는 터미널이다. 앱을 에이전트 셸에서 다시 띄우면 그 셸의
        // NO_COLOR=1이 모든 탭으로 새어 Codex가 색을 통째로 끈다(2026-10 관측).
        environment.removeValue(forKey: "NO_COLOR")
        // 탭 안의 에이전트가 자기 주소를 알 수 있게 — tmux의 TMUX_PANE에 해당. `fine id`가 읽는다.
        environment["FINE_TAB_ID"] = id.uuidString.lowercased()
        if environment["FINE_HOME"] != nil { environment["HOME"] = FinePaths.home.path }
        environment.removeValue(forKey: "TMUX")
        environment.removeValue(forKey: "TMUX_PANE")
        environment = QuickSessionPolicy.applyingEnvironment(
            environment,
            launch: effectiveLaunch,
            configuration: configuration
        )

        let launch = Self.agentWrapped(
            executable: shell,
            execName: executableName,
            arguments: Self.launchArguments(launch: effectiveLaunch, configuration: configuration)
        )
        let view = getOrCreateTerminal()
        let surface = view.start(Self.ghosttyLaunch(
            executable: launch.executable,
            arguments: launch.arguments,
            environment: environment,
            base: base,
            workingDirectory: directory
        ))
        if surface.failedToStart {
            startError = "터미널 시작 실패: libghostty 표면을 만들지 못했습니다"
            isRunning = false
            return
        }
        isRunning = true
        startError = nil
        beginIdentityUpdates()
    }

    /// 실행 파일과 인자를 libghostty가 띄울 셸 한 줄로. libghostty는 이 줄을 bash로 `exec`하므로 낱말마다
    /// 작은따옴표를 친다. 표면 설정은 환경 변수를 더하는 것만 받으므로, 앱 환경에서 지워야 하는 변수
    /// (NO_COLOR, TMUX, 게이트웨이 변수 …)는 `/usr/bin/env -u`로 앞에서 지운다. 값은 명령줄이 아니라 표면
    /// 환경으로 넘긴다 — `ps`에 토큰이 보이지 않게.
    ///
    /// `fine-agent`가 받던 argv0(로그인 셸의 `-zsh`)는 셸 인자 `-l`이 같은 일을 하므로, 도우미 없이 돌 때
    /// (swift run)는 실행 파일 경로를 그대로 쓴다.
    static func ghosttyLaunch(
        executable: String,
        arguments: [String],
        environment: [String: String],
        base: [String: String],
        workingDirectory: String
    ) -> GhosttyTerminalView.Launch {
        let set = environment.filter { base[$0.key] != $0.value }
        let unset = base.keys.filter { environment[$0] == nil }.sorted()
        var words: [String] = []
        if !unset.isEmpty { words = ["/usr/bin/env"] + unset.flatMap { ["-u", $0] } }
        words += [executable] + arguments
        return .init(command: words.map(shellQuoted).joined(separator: " "),
                     workingDirectory: workingDirectory, environment: set)
    }

    static func shellQuoted(_ word: String) -> String {
        let plain = CharacterSet(charactersIn:
            "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_./=:@%+,")
        if !word.isEmpty, word.unicodeScalars.allSatisfy(plain.contains) { return word }
        return "'" + word.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    /// 앞 프로세스 그룹의 리더(맥에서 libghostty가 띄운 `login`). 셸·에이전트가 같은 그룹에 있다.
    private var processGroupLeader: pid_t? {
        terminalView?.foregroundProcessIdentifier
    }

    private func beginIdentityUpdates() {
        identityTimer?.invalidate()
        titleCancellable = nil
        metadataGeneration = UUID()
        metadataRefreshInFlight = false
        if configuration.harness == .codex, sessionId != nil {} else if case .resume = launch {} else if case .resumeLatest = launch, sessionId != nil {} else {
            sessionId = nil
            if !isNameUserSet { name = initialName }
        }

        if configuration.harness == .claude {
            let scanner = QuickConversationScanner.shared
            titleCancellable = scanner.$aiTitlesBySessionId
                .receive(on: DispatchQueue.main)
                .sink { [weak self] titles in self?.updateTitle(titlesBySessionId: titles) }
            scanner.start()
            if let sessionId { scanner.track(sessionID: sessionId, owner: id) }
        }

        // 자식은 표면의 입출력 스레드에서 막 뜨는 중이라 앞 그룹이 아직 없을 수 있다. 곧 한 번 더 본다.
        refreshSessionMetadata(processIdentifier: processGroupLeader ?? 0)
        let generation = metadataGeneration
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            guard let self, self.metadataGeneration == generation, self.sessionId == nil,
                  let leader = self.processGroupLeader else { return }
            self.refreshSessionMetadata(processIdentifier: leader)
        }
        identityTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) {
            [weak self] timer in
            guard let self, self.isRunning else {
                timer.invalidate()
                return
            }
            if self.configuration.harness == .claude && self.sessionId != nil {
                timer.invalidate()
                self.identityTimer = nil
                return
            }
            if self.sessionId == nil || AppResourcePolicy.hasVisibleWindows {
                self.refreshSessionMetadata(processIdentifier: self.processGroupLeader ?? 0)
            }
        }
        identityTimer?.tolerance = 0.5
    }

    /// `processIdentifier`: 앞 프로세스 그룹의 리더. Codex는 그룹 전체가 연 파일로, Claude는 그룹 안에서
    /// 자기 pid로 등록부(~/.claude/sessions/<pid>.json)를 쓴 프로세스로 대화를 찾는다.
    func refreshSessionMetadata(processIdentifier: pid_t, store: HarnessSessionStore? = nil) {
        guard !metadataRefreshInFlight else { return }
        metadataRefreshInFlight = true
        let generation = metadataGeneration
        let knownID = sessionId
        let harness = configuration.harness
        let startedAt = identityStartedAt
        let initialPrompt: String?
        if case .initialPrompt(let prompt) = launch { initialPrompt = prompt } else { initialPrompt = nil }
        metadataQueue.async { [weak self] in
            let store = store ?? HarnessSessionStore.local
            let resolvedID: String?
            let activeCodexID = harness == .codex
                ? CodexSessionResolver.sessionId(processIdentifier: processIdentifier) : nil
            if let activeCodexID {
                resolvedID = activeCodexID
            } else if let knownID {
                resolvedID = knownID
            } else {
                switch harness {
                case .claude:
                    // 표면의 직속 자식은 `login`이고 Claude는 그 아래에 있다 — 그룹을 훑는다.
                    resolvedID = ProcessGroup.members(of: processIdentifier).lazy
                        .compactMap { QuickSessionTitleResolver.sessionId(processIdentifier: $0) }
                        .first
                case .codex:
                    resolvedID = store.newSessionID(
                        harness: harness, createdAfter: startedAt,
                        workingDirectory: QuickSessionPolicy.workingDirectory,
                        initialPrompt: initialPrompt
                    )
                case .opencode:
                    resolvedID = store.newSessionID(
                        harness: harness, createdAfter: startedAt,
                        workingDirectory: QuickSessionPolicy.workingDirectory, initialPrompt: initialPrompt
                    )
                case .omp:
                    // 이 작업 디렉터리에서 탭이 뜬 뒤에 시작된 세션을 집는다.
                    resolvedID = OmpSessionResolver.newestSession(
                        workingDirectory: QuickSessionPolicy.workingDirectory,
                        after: startedAt
                    )?.id
                }
            }
            let metadata = resolvedID.map { id in
                store.metadata(harness: harness, sessionID: id)
                    ?? HarnessSessionMetadata(id: id, title: nil)
            }
            DispatchQueue.main.async { [weak self] in
                guard let self, self.metadataGeneration == generation else { return }
                self.metadataRefreshInFlight = false
                if let metadata {
                    self.applyMetadata(metadata, confirmedCodexIdentity: activeCodexID)
                }
            }
        }
    }

    func applyMetadata(_ metadata: HarnessSessionMetadata, confirmedCodexIdentity: String? = nil) {
        let confirmedSwitch = configuration.harness == .codex
            && confirmedCodexIdentity == metadata.id
        guard sessionId == nil || sessionId == metadata.id || confirmedSwitch else { return }
        let identityChanged = sessionId != metadata.id
        sessionId = metadata.id
        if identityChanged {
            if confirmedSwitch, !isNameUserSet { name = metadata.title ?? initialName }
            configurationStorage.saveIfAbsent(configuration, for: metadata.id)
            persistenceHandler?()
        }
        if configuration.harness == .claude {
            updateTitle(titlesBySessionId: QuickConversationScanner.shared.aiTitlesBySessionId)
            if identityChanged { QuickConversationScanner.shared.track(sessionID: metadata.id, owner: id) }
        } else if let title = metadata.title {
            updateTitle(titlesBySessionId: [metadata.id: title])
        }
    }

    func updateTitle(titlesBySessionId: [String: String]) {
        // 사용자가 지은 이름은 하네스의 제목보다 세다.
        guard !isNameUserSet else { return }
        guard let sessionId, let title = titlesBySessionId[sessionId],
              !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, title != name else { return }
        name = title
        persistenceHandler?()
    }

    func matchesConversation(sessionId: String) -> Bool {
        self.sessionId == sessionId
    }

    /// 끝난 탭을 다시 고르면 같은 대화를 새 표면으로 다시 띄운다(끝난 표면은 닫는다).
    func restartIfDead() {
        guard started, terminalView?.isProcessRunning != true else { return }
        startError = nil
        startProcess()
    }

    /// CLI 입력 경로 — 사용자가 키보드로 친 것과 같은 바이트가 PTY로 들어간다.
    @discardableResult
    func write(_ data: Data) -> Bool {
        terminalView?.write(data) ?? false
    }

    var hasTerminal: Bool { terminalView != nil }

    func readScreen(lines: Int, completion: @escaping (String?) -> Void) {
        completion(terminalView?.readScreen(lines: lines))
    }

    func readTheme(completion: @escaping (String?) -> Void) {
        completion(terminalView?.themeReport())
    }

    func focusTerminal() {
        DispatchQueue.main.async { [weak self] in self?.terminalView?.focusTerminal() }
    }

    /// 탭을 닫는다. 표면이 사라지면 이 자식과 대화할 수단이 영영 없어지므로, `force`와 상관없이 신호를
    /// 무시하는 자식(Claude Code)까지 유예 뒤 SIGKILL로 정리한다(`force`는 호출부 호환으로 남겨 둔다).
    func cleanup(force: Bool = false) {
        QuickConversationScanner.shared.untrack(owner: id)
        metadataGeneration = UUID()
        identityTimer?.invalidate()
        identityTimer = nil
        titleCancellable = nil
        terminalView?.terminate()
        terminalView?.removeFromSuperview()
        terminalView = nil
    }

    /// 앱 종료 경로 — 비동기 승격이 실행될 기회가 없으므로 동기적으로 종료한다.
    func cleanupForTermination() {
        QuickConversationScanner.shared.untrack(owner: id)
        metadataGeneration = UUID()
        identityTimer?.invalidate()
        identityTimer = nil
        titleCancellable = nil
        terminalView?.terminate(synchronously: true)
        terminalView?.removeFromSuperview()
        terminalView = nil
    }

    /// 탭 셸을 FineAgent.app(LSUIElement) 아래에서 exec하게 감싼다. 안 그러면 탭 안의
    /// AppKit 도구가 "Fine" 앱으로 등록돼 Dock에 유령 아이콘이 쌓인다 (Sources/FineAgent).
    /// `swift run`처럼 번들 밖에서 돌 때는 도우미가 없으니 셸을 그대로 띄운다.
    static func agentWrapped(
        executable: String,
        execName: String,
        arguments: [String],
        bundleURL: URL = Bundle.main.bundleURL
    ) -> (executable: String, execName: String, arguments: [String]) {
        let agent = bundleURL.appendingPathComponent("Contents/Helpers/FineAgent.app/Contents/MacOS/fine-agent").path
        guard FileManager.default.isExecutableFile(atPath: agent) else {
            return (executable, execName, arguments)
        }
        return (agent, "fine-agent", [executable, execName] + arguments)
    }

    static func launchArguments(
        launch: QuickLaunch = .blank,
        configuration: QuickSessionConfiguration = .default
    ) -> [String] {
        QuickSessionPolicy.shellArguments
            + [QuickSessionPolicy.launchCommand(for: launch, configuration: configuration)]
    }

    static func == (lhs: TerminalSession, rhs: TerminalSession) -> Bool {
        lhs.id == rhs.id
    }
}
