import AppKit
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
    /// sm 모드에서 이 탭이 보는 sm 세션 이름(SmSessionBridge). nil이면 에이전트를 직접 띄운 탭이다.
    @Published private(set) var smSessionName: String?
    /// sm에서 옮겨 온 세션: 띄우지 않고 붙기만 한다(그 세션을 띄운 건 sm이다).
    private var attachesOnly = false
    /// 늦게 끝난 spawn이 그 사이 다시 띄운 표면을 건드리지 않게.
    private var heldGeneration = UUID()
    /// 창에서 지금 보이는 탭인가(창의 선택된 탭). sm 세션 탭은 보일 때만 그 세션에 붙는다 — 가려진 탭까지
    /// 붙어 있으면 세션 층에는 늘 "보는 중"으로 보여 쓰지 않는 세션도 잠들지 못한다.
    var isVisible = false {
        didSet { if isVisible != oldValue { visibilityDidChange() } }
    }
    /// 이 탭의 표면이 지금 sm 세션에 붙어 있는가.
    private var heldAttached = false
    /// 세션이 있다(새 탭이면 띄우기가 끝났다) — 그 전에 붙으면 띄우기와 붙기가 같은 세션을 두고 다툰다.
    private var heldReady = false
    /// 붙기·내리기마다 바뀐다 — 늦게 온 상태 줄이나 확인 결과가 다음 붙기를 건드리지 않게.
    private var raiseGeneration = UUID()
    private var stateWatch: SmSessionBridge.StateWatch?
    /// 마지막으로 가려진 때. 세션 층은 65분 쉰 세션을 재우므로, 그보다 오래 가려졌으면 깨는 모습으로 시작한다.
    private var loweredAt: Date?
    /// 가려진 탭이 attach를 내리기까지. 바로 내리면 탭을 오갈 때마다 다시 붙느라 막이 덮였다(11/09: "다른 탭
    /// 본지 1분도 안 됐는데 돌아오면 로딩"). 세션 층은 65분 쉰 세션만 재우므로 10분 붙들어도 잠들기는 막지 않는다
    /// — sm 앱(LayoutTerminals.parkAfter)과 같은 값.
    static var lowerAfter: TimeInterval = 600
    private var pendingLower: DispatchWorkItem?
    /// 원격 세션(NAME@HOST)에 다시 연결하기까지 기다릴 시간. 붙으면 0으로 돌아간다.
    private var reconnectDelay: TimeInterval = 0
    /// 다음 붙기가 끊긴 연결을 다시 잇는 것인가 — 그때는 세션 층에 물을 수 없어 출력이 조용해지면 걷는다.
    private var reconnecting = false
    /// 세션이 사라졌을 때(sm 기록이 없음) 같은 대화로 다시 띄우는 데 쓰는 환경.
    private var heldEnvironment: [String: String] = [:]

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
        smSessionName = snapshot.smSessionName
        // Fine이 띄운 세션은 탭 UUID에서 온 이름이다. 그렇지 않으면 sm에서 옮겨 온 세션 — 붙기만 한다.
        if let held = snapshot.smSessionName, held != SmSessionBridge.name(for: snapshot.id) { attachesOnly = true }
    }

    /// sm에서 옮겨 온 세션을 보는 탭(`fine attach NAME`). 탭을 닫으면 Fine 탭의 규칙대로 그 세션을 끝낸다.
    convenience init(attaching name: String, harness: QuickHarness,
                     configurationStorage: QuickSessionConfigurationStorage = .shared) {
        self.init(name: name, launch: .blank, configuration: .defaultConfiguration(for: harness),
                  configurationStorage: configurationStorage)
        smSessionName = name
        attachesOnly = true
    }

    func snapshot() -> QuickSessionSnapshot {
        QuickSessionSnapshot(
            id: id,
            name: name,
            conversationID: sessionId,
            configuration: configuration,
            isNameUserSet: isNameUserSet ? true : nil,
            parentID: parentID,
            smSessionName: smSessionName
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
            DispatchQueue.main.async { self?.surfaceDidExit() }
        }
        // 터미널 프로그램이 보낸 알림(OSC 9/777)은 macOS 알림이 아니라 Fine 노치에 이 탭의 항목으로 올린다 —
        // 누르면 이 탭이 열리고, 훅이 올리는 알림과 한 곳에 모인다.
        view.onNotification = { [weak self] title, body in
            guard let self else { return }
            MainActor.assumeIsolated { self.postTerminalNotification(title: title, body: body) }
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

        // sm 모드: 에이전트는 sm 세션으로 띄우고 이 탭은 거기에 붙는다 — Fine이 내려가도 대화가 산다.
        if let executable = SmSessionBridge.executable {
            let name = smSessionName ?? SmSessionBridge.name(for: id)
            heldEnvironment = environment
            // 이미 있는 세션(다시 연 탭·sm에서 옮겨 온 탭)은 띄우지 않는다 — 띄우기는 잠든 세션까지 깨운다.
            // 보일 때 붙으면서 깨운다. 새 탭만 여기서 세션을 만든다.
            if attachesOnly || smSessionName != nil {
                startHeld(name: name, spawn: nil, environment: environment, executable: executable)
                return
            }
            if let spawn = SmSessionBridge.spawn(name: name, tabID: id, launch: effectiveLaunch,
                                                configuration: configuration, workingDirectory: directory,
                                                path: environment["PATH"] ?? "") {
                startHeld(name: name, spawn: spawn, environment: environment, executable: executable)
                return
            }
        }

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

    /// 이 탭의 sm 세션을 맡는다. `spawn`이 있으면 세션을 만들고(에이전트가 등록될 때까지 몇 초 — 뒤에서),
    /// 보이는 탭이면 그 세션에 붙는다. 가려진 탭은 세션만 돌고 붙지 않는다.
    private func startHeld(name: String, spawn: SmSessionBridge.Spawn?, environment: [String: String],
                           executable: String) {
        if smSessionName != name {
            smSessionName = name
            persistenceHandler?()
        }
        isRunning = true
        startError = nil
        _ = getOrCreateTerminal()
        let generation = UUID()
        heldGeneration = generation
        heldReady = spawn == nil
        guard let spawn else {
            beginIdentityUpdates()
            if isVisible { raiseHeld() }
            return
        }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            var failure: String?
            do { try SmSessionBridge.run(spawn, environment: environment, executable: executable) }
            catch { failure = String(describing: error) }
            DispatchQueue.main.async {
                guard let self, self.heldGeneration == generation else { return }
                if let failure {
                    self.startError = "sm 세션을 띄우지 못했습니다: \(failure)"
                    self.isRunning = false
                    return
                }
                self.heldReady = true
                self.beginIdentityUpdates()
                if self.isVisible { self.raiseHeld() }
            }
        }
    }

    private var isHeld: Bool { smSessionName != nil && SmSessionBridge.isAvailable }

    private func visibilityDidChange() {
        guard isHeld, started, startError == nil else { return }
        pendingLower?.cancel()
        pendingLower = nil
        if isVisible { raiseHeld(); return }
        let work = DispatchWorkItem { [weak self] in
            guard let self, !self.isVisible else { return }
            self.pendingLower = nil
            self.lowerHeld()
        }
        pendingLower = work
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.lowerAfter, execute: work)
    }

    /// 보이는 탭을 그 세션에 붙인다. 화면(장면)이 있으면 그 아래에 새 표면을 깔고 덮개를 얹는다 — 깨어 있는
    /// 세션이면 막 없이(같은 화면이 이어진다), 쉬는 중이면 숨쉬는 막으로. 세션 층이 ready를 알리고 화면이
    /// 조용해지면 걷힌다. 화면이 없으면(앱을 다시 켰다) 깨어 있는 세션은 바로 붙고, 쉬는 세션은 세션 층이
    /// 남긴 마지막 화면으로 장면을 만든다.
    private func raiseHeld() {
        guard let name = smSessionName, let executable = SmSessionBridge.executable,
              heldReady, !heldAttached, let view = terminalView else { return }
        heldAttached = true
        let generation = UUID()
        raiseGeneration = generation
        let attach = GhosttyTerminalView.Launch(command: SmSessionBridge.attachCommand(name, executable: executable),
                                                workingDirectory: QuickSessionPolicy.ensureWorkingDirectory())
        if view.stage.hasFrame {
            let mayBeAsleep = loweredAt.map { Date().timeIntervalSince($0) > 60 * 60 } ?? false
            let resting = view.stage.isCovered && view.stage.look != .clear
            if !resting { reconnecting = false }
            if !reconnecting { view.stage.caption = nil }
            connect(view, name: name, attach: attach, covered: true,
                    look: mayBeAsleep || resting ? .waking : .clear, generation: generation)
            return
        }
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let state = SmSessionBridge.state(name)
            let screen = state == "ready" ? nil : SmSessionBridge.screen(name)
            DispatchQueue.main.async {
                guard let self, self.raiseGeneration == generation, let view = self.terminalView else { return }
                if state == "gone" {
                    self.heldAttached = false
                    self.reopenHeld()
                    return
                }
                if let screen { view.rest(replaying: screen) }
                self.connect(view, name: name, attach: attach, covered: screen != nil, look: .waking,
                             generation: generation)
            }
        }
    }

    private func connect(_ view: FineTerminalView, name: String, attach: GhosttyTerminalView.Launch, covered: Bool,
                         look: GhosttySessionStage.Look, generation: UUID) {
        if view.start(attach, covered: covered).failedToStart {
            heldAttached = false
            startError = "터미널 시작 실패: libghostty 표면을 만들지 못했습니다"
            return
        }
        if covered { view.stage.setLook(look) }
        view.stage.onReveal = { [weak self, weak view] in
            self?.reconnectDelay = 0
            view?.stage.caption = nil
        }
        if covered, reconnecting {
            // 다시 연결: 끊긴 동안은 세션 층에 물을 수 없으므로 앱이 정한다 — 다시 받은 출력이 조용해지면 걷는다.
            reconnecting = false
            view.stage.revealWhenQuiet()
        }
        // 붙어 있는 내내 세션 상태를 본다: 덮인 동안은 ready가 걷을 신호이고, 걷힌 뒤에 멈춤·잠듦·사라짐이
        // 오면 다시 덮는다. 세션이 멈춰도 attach는 끝나지 않고 키를 기다리므로 끝남으로는 알 수 없다.
        stopStateWatch()
        stateWatch = SmSessionBridge.StateWatch(name: name) { [weak self, weak view] state in
            guard let self, self.raiseGeneration == generation, let view, view.stage.live != nil else { return }
            if view.stage.isCovered {
                if state == "ready" { view.stage.revealWhenQuiet() } else if state != "gone" { view.stage.setLook(.waking) }
            } else if ["stopped", "asleep", "gone"].contains(state) {
                self.sessionWentAway(state)
            }
        }
        guard covered else { return }
        // 세션 층이 끝내 ready를 알리지 않아도 영영 덮여 있지 않게.
        DispatchQueue.main.asyncAfter(deadline: .now() + 45) { [weak self, weak view] in
            guard let self, self.raiseGeneration == generation, let view, view.stage.isCovered,
                  view.stage.live != nil else { return }
            view.stage.reveal()
        }
    }

    /// 가려진 탭: 세션을 보던 attach만 내리고 화면은 남긴다. 세션은 그대로 돌고, 쓰지 않으면 세션 층이 재운다.
    private func lowerHeld() {
        guard heldAttached else { return }
        heldAttached = false
        raiseGeneration = UUID()
        stopStateWatch()
        terminalView?.lower()
        loweredAt = Date()
    }

    /// 붙어 있던 attach가 스스로 끝났다. 직접 띄운 탭은 자식이 끝난 것이고, sm 세션 탭은 세션이 멈췄거나
    /// 사라졌거나 연결이 끊긴 것이다 — 마지막 화면 위에 어두운 막을 얹고 세션 상태를 본다.
    private func surfaceDidExit() {
        guard isHeld, let name = smSessionName, let view = terminalView else {
            isRunning = false
            return
        }
        heldAttached = false
        stopStateWatch()
        view.rest(caption: nil)
        let generation = UUID()
        raiseGeneration = generation
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            let state = SmSessionBridge.state(name)
            DispatchQueue.main.async {
                guard let self, self.raiseGeneration == generation, let view = self.terminalView else { return }
                switch state {
                case nil where name.contains("@"):
                    // 원격 세션에 물을 수 없다 = 연결이 끊겼다(맥이 잠들었다 깨는 등). 에이전트는 저쪽에서 계속 돈다.
                    // "연결 중"(깨는 중과 같은 모습)으로 두고 점점 간격을 늘려 다시 붙는다.
                    view.stage.caption = "다시 연결하는 중"   // sm 패널과 같은 글
                    view.stage.setLook(.waking)
                    view.stage.onKeyWhileResting = nil
                    self.reconnectDelay = min(30, max(2, self.reconnectDelay * 2))
                    DispatchQueue.main.asyncAfter(deadline: .now() + self.reconnectDelay) { [weak self] in
                        guard let self, self.raiseGeneration == generation, self.isVisible else { return }
                        self.reconnecting = true
                        self.raiseHeld()
                    }
                case "stopped":
                    view.stage.caption = "멈춤 · 아무 키나 누르면 깨어납니다"
                    view.stage.onKeyWhileResting = { [weak self] in self?.raiseHeld() }
                case "gone", nil:
                    view.stage.caption = "세션이 끝났습니다 · 아무 키나 누르면 이 대화를 다시 엽니다"
                    view.stage.onKeyWhileResting = { [weak self] in self?.reopenHeld() }
                default:
                    // 쉬는 중·깨는 중·준비됨(연결만 끊김): 보이는 탭이면 바로 다시 붙는다.
                    view.stage.onKeyWhileResting = { [weak self] in self?.raiseHeld() }
                    if self.isVisible { self.raiseHeld() }
                }
            }
        }
    }

    /// 보고 있던 세션이 멈췄거나(sm stop) 잠들었거나 사라졌다: attach를 내리고 그 화면 위에 어두운 막을 얹는다.
    /// 멈춘 세션은 저절로 깨우지 않고 키를 기다린다. 사라진 세션은 키를 누르면 같은 대화로 다시 연다.
    private func sessionWentAway(_ state: String) {
        guard heldAttached, let view = terminalView else { return }
        heldAttached = false
        raiseGeneration = UUID()
        stopStateWatch()
        switch state {
        case "gone":
            view.rest(caption: "세션이 끝났습니다 · 아무 키나 누르면 이 대화를 다시 엽니다")
            view.stage.onKeyWhileResting = { [weak self] in self?.reopenHeld() }
        case "asleep":
            view.rest(caption: nil)
            view.stage.onKeyWhileResting = { [weak self] in self?.raiseHeld() }
            if isVisible { raiseHeld() }
        default:
            view.rest(caption: "멈춤 · 아무 키나 누르면 깨어납니다")
            view.stage.onKeyWhileResting = { [weak self] in self?.raiseHeld() }
        }
    }

    /// sm 기록까지 사라진 세션을 같은 대화로 다시 띄운다(아는 대화가 없으면 빈 대화).
    private func reopenHeld() {
        guard let name = smSessionName, let executable = SmSessionBridge.executable, !heldAttached else { return }
        let launch: QuickLaunch = sessionId.map { .resume(sessionId: $0) } ?? .blank
        guard !attachesOnly,
              let spawn = SmSessionBridge.spawn(name: name, tabID: id, launch: launch, configuration: configuration,
                                                workingDirectory: QuickSessionPolicy.ensureWorkingDirectory(),
                                                path: heldEnvironment["PATH"] ?? ProcessInfo.processInfo.environment["PATH"] ?? "")
        else {
            startError = "sm 세션 \(name)이 없습니다"
            isRunning = false
            return
        }
        terminalView?.stage.caption = nil
        terminalView?.stage.setLook(.waking)
        let environment = heldEnvironment.isEmpty ? ProcessInfo.processInfo.environment : heldEnvironment
        startHeld(name: name, spawn: spawn, environment: environment, executable: executable)
    }

    private func stopStateWatch() {
        stateWatch?.stop()
        stateWatch = nil
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
        // sm 세션의 대화 id는 sm-session ls로 묻는다(한 번에 0.17초) — Codex가 대화를 바꿨는지는 15초마다 본다.
        let interval: TimeInterval = smSessionName != nil && configuration.harness == .codex ? 15 : 2
        identityTimer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) {
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
        let heldName = smSessionName
        metadataQueue.async { [weak self] in
            let store = store ?? HarnessSessionStore.local
            let resolvedID: String?
            // sm 세션이면 에이전트가 이 탭의 프로세스 그룹 밖(holder 아래)에 있다. sm이 아는 대화 id를 쓴다.
            // OpenCode·omp는 셸 세션이라 sm이 대화 id를 모른다 — 그 둘은 아래의 저장소 기반 찾기를 그대로 쓴다.
            let heldSession = harness == .claude || harness == .codex
                ? heldName.flatMap { name in SmSessionBridge.rows().first { $0.name == name }?.session } : nil
            let activeCodexID = harness == .codex
                ? (heldName != nil ? heldSession : CodexSessionResolver.sessionId(processIdentifier: processIdentifier))
                : nil
            if heldName != nil, harness == .claude {
                resolvedID = heldSession ?? knownID
            } else if let activeCodexID {
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

    /// 이 탭의 터미널 알림 항목 key. sm 패널도 같은 모양(`terminal:<패널 UUID>`)으로 올린다.
    var terminalNotificationKey: String { "terminal:\(id.uuidString.lowercased())" }
    private var notificationInputMonitor: Any?

    @MainActor
    func postTerminalNotification(title: String, body: String, store: AttentionStore = .shared) {
        let message = body.isEmpty ? title : body
        guard !message.isEmpty else { return }
        do {
            _ = try store.post([
                "source": "fine:\(id.uuidString.lowercased())",
                "key": terminalNotificationKey,
                "title": title.isEmpty ? name : title,
                "message": String(message.prefix(4000)),
                "state": "waiting",
            ])
            if store === AttentionStore.shared { watchInputForNotification() }
        } catch {
            NSLog("Fine: terminal notification was not posted: %@", String(describing: error))
        }
    }

    /// 사용자가 이 탭에 입력하면 그 알림을 내린다 — seol-notch 알림이 그 칸의 다음 입력에 내려가는 것과 같고,
    /// sm 패널의 터미널 알림도 같다. 전에는 ×로만 내려가서 지난 "입력을 기다립니다"가 노치에 쌓였다.
    /// 알림이 떠 있는 동안에만 키를 엿본다.
    @MainActor
    private func watchInputForNotification() {
        guard notificationInputMonitor == nil else { return }
        notificationInputMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            if let self, let surface = self.terminalView?.surface, event.window?.firstResponder === surface {
                MainActor.assumeIsolated { self.clearTerminalNotification() }
            }
            return event
        }
    }

    private func stopWatchingInputForNotification() {
        if let notificationInputMonitor { NSEvent.removeMonitor(notificationInputMonitor) }
        notificationInputMonitor = nil
    }

    /// 이 탭의 터미널 알림을 내린다(완료로 바꿔 30초 뒤 사라지게). 이미 지웠으면 아무것도 하지 않는다.
    @MainActor
    func clearTerminalNotification(store: AttentionStore = .shared) {
        stopWatchingInputForNotification()
        guard let item = store.items.first(where: { $0.key == terminalNotificationKey && $0.state.needsAttention }) else { return }
        _ = try? store.post(["source": item.source, "key": item.key, "title": item.title,
                             "message": "이어서 진행하고 있어요.", "state": "done"])
    }

    /// 끝난 탭을 다시 고르면 같은 대화를 새 표면으로 다시 띄운다(끝난 표면은 닫는다).
    func restartIfDead() {
        if isHeld, started {
            if startError != nil {
                startError = nil
                startProcess()
            } else if isVisible, !heldAttached {
                raiseHeld()
            }
            return
        }
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
        // 가려진 sm 세션 탭은 붙어 있지 않다 — 세션 층이 가진 화면을 읽는다.
        if isHeld, !heldAttached, let name = smSessionName {
            DispatchQueue.global(qos: .userInitiated).async {
                let text = SmSessionBridge.tail(name, lines: lines)
                DispatchQueue.main.async { completion(text) }
            }
            return
        }
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
    /// sm 세션이면 그 세션을 끝낸다 — Fine에서 탭을 닫으면 에이전트가 실제로 끝나야 한다.
    func cleanup(force: Bool = false) {
        if let held = smSessionName {
            SmSessionBridge.stop(held)
            detachSurface()
            return
        }
        stopUpdates()
        terminalView?.terminate()
        terminalView?.removeFromSuperview()
        terminalView = nil
    }

    /// 앱 종료 경로 — 비동기 승격이 실행될 기회가 없으므로 동기적으로 종료한다.
    /// sm 세션은 떼기만 한다: Fine을 다시 띄우면 같은 이름으로 다시 붙고, 재부팅 뒤엔 sm restore가 되살린다.
    func cleanupForTermination() {
        if smSessionName != nil {
            detachSurface()
            return
        }
        stopUpdates()
        terminalView?.terminate(synchronously: true)
        terminalView?.removeFromSuperview()
        terminalView = nil
    }

    /// sm으로 옮긴다: 세션은 그대로 두고 이 탭의 표면만 뗀다. 옮길 세션 이름을 돌려준다(직접 띄운 탭은 nil).
    func detachForHandoff() -> String? {
        guard let held = smSessionName else { return nil }
        detachSurface()
        return held
    }

    private func stopUpdates() {
        stopWatchingInputForNotification()
        QuickConversationScanner.shared.untrack(owner: id)
        metadataGeneration = UUID()
        heldGeneration = UUID()
        identityTimer?.invalidate()
        identityTimer = nil
        titleCancellable = nil
    }

    /// 붙어 있던 `sm-session attach`만 끝낸다(에이전트는 holder 아래에서 계속 돈다).
    private func detachSurface() {
        heldAttached = false
        raiseGeneration = UUID()
        stopStateWatch()
        stopUpdates()
        terminalView?.detach()
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
