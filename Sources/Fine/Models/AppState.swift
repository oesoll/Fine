import Combine
import Foundation

final class AppState: ObservableObject {
    private let storage: WindowStateStorage
    private let configurationStorage: QuickSessionConfigurationStorage
    let windowStateID: UUID
    private(set) var restoredFrame: WindowFrameState?
    private(set) var restoredIsZoomed = false
    private(set) var restoredIsFullscreen = false

    @Published var isBackgroundPickerPresented = false
    @Published var sessions: [TerminalSession] = []
    @Published var selectedSession: TerminalSession? {
        didSet { observeSelectedSession() }
    }
    private var selectedSessionObservation: AnyCancellable?

    init(
        requestedWindowStateID: UUID? = nil,
        storage: WindowStateStorage = .shared,
        configurationStorage: QuickSessionConfigurationStorage = .shared
    ) {
        self.storage = storage
        self.configurationStorage = configurationStorage
        let claimed = requestedWindowStateID.flatMap { storage.claim(id: $0) }
            ?? (requestedWindowStateID == nil ? storage.claimNext() : nil)
        if let claimed {
            windowStateID = claimed.id
            restoredFrame = claimed.frame
            restoredIsZoomed = claimed.resolvedIsZoomed
            restoredIsFullscreen = claimed.resolvedIsFullscreen
            sessions = (claimed.sessions ?? []).map {
                TerminalSession(snapshot: $0, configurationStorage: configurationStorage)
            }
            sessions.forEach(bindPersistence)
            normalizeGroups()
            selectedSession = sessions.first { $0.id == claimed.selectedSessionID }
            resumeRestoredSessions()
        } else {
            if let requestedWindowStateID, !storage.contains(id: requestedWindowStateID) {
                windowStateID = requestedWindowStateID
            } else {
                windowStateID = UUID()
            }
            storage.registerClaimed(windowStateID)
            persistWindowState()
        }
        FineWindowRegistry.shared.register(self)
    }

    /// Fine을 다시 열면 열려 있던 대화가 스스로 이어진다.
    ///
    /// 앱이 종료될 때 자식 PTY는 같이 죽는다(그래야 launchd에 입양되지 않는다). 그래서
    /// "몇 분 유예"로 프로세스를 살려두는 길은 없고, 대신 대화를 재개하는 쪽을 택한다.
    /// 대화 ID가 있는 탭만 되살린다 — ID가 없으면 무엇을 이어야 할지 알 수 없고,
    /// 그 상태에서 "최근 대화"를 집으면 다른 탭과 같은 것을 열게 된다.
    private func resumeRestoredSessions() {
        var claimedConversations: Set<String> = []
        for session in sessions {
            guard case .resume(let conversationID) = session.launch else { continue }
            // 같은 대화를 두 탭이 붙잡지 않도록 한 번만 살린다.
            guard claimedConversations.insert(conversationID).inserted else { continue }
            session.startImmediately()
        }
    }

    deinit {
        FineWindowRegistry.shared.unregister(self)
        if !AppTermination.isTerminating {
            storage.remove(id: windowStateID)
        }
    }

    var windowTitle: String { selectedSession?.name ?? "Fine" }

    func addSession(
        initialPrompt: String? = nil,
        resumeSessionId: String? = nil,
        configuration: QuickSessionConfiguration = .default,
        startImmediately: Bool = true,
        parentID: UUID? = nil
    ) {
        let launch: QuickLaunch
        if let resumeSessionId, QuickSessionIdentifier.isValid(resumeSessionId, for: configuration.harness) {
            launch = .resume(sessionId: resumeSessionId)
        } else if let initialPrompt {
            let trimmed = initialPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
            launch = trimmed.isEmpty ? .blank : .initialPrompt(trimmed)
        } else {
            launch = .blank
        }
        let session = TerminalSession(
            name: QuickSessionPolicy.initialSessionName(for: configuration.harness),
            launch: launch,
            configuration: configuration,
            configurationStorage: configurationStorage
        )
        bindPersistence(session)
        sessions.append(session)
        // 에이전트가 자기 탭에서 띄운 탭이면 그 아래로 묶는다.
        if let parentID, let root = rootID(of: parentID) {
            session.parentID = root
            normalizeGroups()
        }
        selectSession(session)
        if startImmediately { session.startImmediately() }
    }

    func resumeConversation(_ conversation: QuickConversation, startImmediately: Bool = true) {
        guard QuickSessionIdentifier.isValid(conversation.id, for: conversation.harness) else { return }
        if let existing = sessions.first(where: {
            $0.configuration.harness == conversation.harness && $0.matchesConversation(sessionId: conversation.id)
        }) {
            selectSession(existing)
            return
        }
        var configuration = QuickSessionConfiguration.defaultConfiguration(for: conversation.harness)
        if let saved = configurationStorage.configuration(for: conversation.id), saved.harness == conversation.harness {
            configuration = saved
        }
        addSession(
            resumeSessionId: conversation.id,
            configuration: configuration,
            startImmediately: startImmediately
        )
        selectedSession?.name = conversation.title
    }

    func resumeConversation(sessionId: String) {
        if let existing = sessions.first(where: { $0.matchesConversation(sessionId: sessionId) }) {
            selectSession(existing)
            return
        }
        addSession(
            resumeSessionId: sessionId,
            configuration: resumeConfiguration(for: sessionId)
        )
    }

    @discardableResult
    func restartSession(
        _ session: TerminalSession,
        with configuration: QuickSessionConfiguration,
        startImmediately: Bool = true
    ) -> Bool {
        guard let index = sessions.firstIndex(of: session),
              let sessionID = session.resumableSessionID else {
            return false
        }
        configurationStorage.save(configuration, for: sessionID)
        let replacement = TerminalSession(
            name: session.name,
            launch: .resume(sessionId: sessionID),
            configuration: configuration,
            configurationStorage: configurationStorage
        )
        bindPersistence(replacement)
        let wasSelected = selectedSession === session
        session.cleanup(force: true)
        sessions[index] = replacement
        if wasSelected {
            selectedSession = replacement
            if startImmediately {
                replacement.startImmediately()
                replacement.focusTerminal()
            }
        }
        return true
    }

    private func resumeConfiguration(for sessionID: String) -> QuickSessionConfiguration {
        configurationStorage.configuration(for: sessionID) ?? .default
    }

    func showHome() {
        selectedSession = nil
        persistWindowState()
    }

    func removeSession(_ session: TerminalSession) {
        session.cleanup(force: true)
        sessions.removeAll { $0.id == session.id }
        // 메인 탭을 닫으면 하위 탭은 풀려서 그 자리에 남는다.
        for child in sessions where child.parentID == session.id { child.parentID = nil }
        if selectedSession?.id == session.id {
            selectedSession = sessions.first
        }
        persistWindowState()
    }

    /// Move existing objects, preserving the PTY, selection and conversation identity.
    @discardableResult
    func moveSession(id: UUID, to targetID: UUID) -> Bool {
        guard id != targetID,
              let source = sessions.firstIndex(where: { $0.id == id }),
              let target = sessions.firstIndex(where: { $0.id == targetID }) else { return false }
        return moveSession(id: id, relativeTo: targetID, edge: source < target ? .after : .before)
    }

    /// Insert at a boundary in the original list, adjusting for removal of the source.
    @discardableResult
    func moveSession(id: UUID, relativeTo targetID: UUID, edge: SessionInsertionEdge) -> Bool {
        guard let target = sessions.firstIndex(where: { $0.id == targetID }),
              let source = sessions.firstIndex(where: { $0.id == id }) else { return false }
        let boundary = target + (edge == .after ? 1 : 0)
        let destination = boundary - (source < boundary ? 1 : 0)
        guard source != destination else { return false }
        let session = sessions.remove(at: source)
        sessions.insert(session, at: destination)
        normalizeGroups()
        persistWindowState()
        return true
    }

    // MARK: - 묶음 (메인 탭 아래 하위 탭)

    /// 묶음의 맨 위 탭. 없는 탭이면 nil.
    func rootID(of id: UUID) -> UUID? {
        guard let session = sessions.first(where: { $0.id == id }) else { return nil }
        if let parent = session.parentID, sessions.contains(where: { $0.id == parent }) { return parent }
        return session.id
    }

    func children(of id: UUID) -> [TerminalSession] {
        sessions.filter { $0.parentID == id }
    }

    /// 탭 순서가 곧 화면 순서다: 메인 탭 바로 아래 그 하위 탭들. 이 불변식을 지키면 선택 표시,
    /// ⌘↑↓, `fine tabs` 번호가 따로 계산할 것 없이 사이드바와 맞는다. 묶음은 한 단 —
    /// 하위의 하위는 맨 위 탭에 붙이고, 사라진 부모를 가리키는 탭은 푼다.
    func normalizeGroups() {
        let ids = Set(sessions.map(\.id))
        for session in sessions {
            guard let parent = session.parentID else { continue }
            if parent == session.id || !ids.contains(parent) { session.parentID = nil; continue }
            if let grand = sessions.first(where: { $0.id == parent })?.parentID, ids.contains(grand) {
                session.parentID = grand
            }
        }
        // 한 번 더: 위에서 부모가 풀린 경우 그 자식이 여전히 맨 위를 가리키도록.
        for session in sessions where session.parentID != nil {
            if sessions.first(where: { $0.id == session.parentID })?.parentID != nil { session.parentID = nil }
        }
        var ordered: [TerminalSession] = []
        for root in sessions where root.parentID == nil {
            ordered.append(root)
            ordered.append(contentsOf: sessions.filter { $0.parentID == root.id })
        }
        if ordered.map(\.id) != sessions.map(\.id) { sessions = ordered }
    }

    /// 사이드바 드롭. 가운데에 놓으면 그 행의 묶음으로, 가장자리에 놓으면 그 자리의 단으로 간다.
    /// 끌어온 탭에 하위 탭이 있었는데 그것이 하위로 들어가면, 그 하위 탭들도 같은 묶음으로 옮긴다.
    @discardableResult
    func dropSession(id: UUID, onto targetID: UUID, edge: SessionInsertionEdge) -> Bool {
        guard id != targetID,
              let dragged = sessions.first(where: { $0.id == id }),
              let target = sessions.first(where: { $0.id == targetID }) else { return false }
        let targetRoot = target.parentID ?? target.id
        let newParent: UUID?
        switch edge {
        case .nest:
            guard targetRoot != id else { return false }
            newParent = targetRoot
        case .before:
            newParent = target.parentID
        case .after:
            // 하위 탭이 달린 메인 탭의 바로 아래는 그 묶음의 첫 자리다.
            newParent = target.parentID ?? (children(of: target.id).isEmpty ? nil : target.id)
        }
        guard newParent != id else { return false }
        let formerChildren = Set(children(of: id).map(\.id))
        if newParent != nil {
            for child in children(of: id) { child.parentID = newParent }
        }
        dragged.parentID = newParent
        if edge == .nest {
            // 묶음의 끝으로. 함께 옮겨 온 원래 하위 탭들은 그 뒤에 따라온다.
            let last = sessions.last { $0.parentID == targetRoot && $0.id != id && !formerChildren.contains($0.id) }
                ?? sessions.first { $0.id == targetRoot }
            if let last { moveSession(id: id, relativeTo: last.id, edge: .after) }
        } else {
            moveSession(id: id, relativeTo: targetID, edge: edge)
        }
        normalizeGroups()
        persistWindowState()
        return true
    }

    /// 하위 탭을 묶음에서 풀어 메인 탭 묶음 바로 아래에 둔다.
    func ungroupSession(id: UUID) {
        guard let session = sessions.first(where: { $0.id == id }), let parent = session.parentID else { return }
        session.parentID = nil
        let last = sessions.last { $0.parentID == parent } ?? sessions.first { $0.id == parent }
        if let last, last.id != id { moveSession(id: id, relativeTo: last.id, edge: .after) }
        normalizeGroups()
        persistWindowState()
    }

    func moveSession(id: UUID, by offset: Int) {
        guard let index = sessions.firstIndex(where: { $0.id == id }),
              sessions.indices.contains(index + offset) else { return }
        moveSession(id: id, to: sessions[index + offset].id)
    }

    /// 창이 닫히거나 앱이 종료될 때 이 창의 모든 세션을 정리한다.
    /// 이 경로가 없으면 대화를 하나씩 닫았을 때만 자식이 정리되고, 창을 통째로
    /// 닫으면 deinit의 SIGHUP만 받은 자식들이 그대로 살아남는다.
    /// synchronous는 앱 종료 경로 — 비동기 승격을 기다릴 수 없을 때 쓴다.
    func cleanupAllSessions(synchronous: Bool = false) {
        let closing = sessions
        sessions.removeAll()
        selectedSession = nil
        for session in closing {
            if synchronous {
                session.cleanupForTermination()
            } else {
                session.cleanup(force: true)
            }
        }
    }

    func selectSession(_ session: TerminalSession) {
        isBackgroundPickerPresented = false
        guard selectedSession?.id != session.id else {
            session.focusTerminal()
            return
        }
        selectedSession = session
        session.restartIfDead()
        session.focusTerminal()
        persistWindowState()
    }

    func selectNextSession() {
        guard !sessions.isEmpty else { return }
        guard let selectedSession,
              let index = sessions.firstIndex(of: selectedSession) else {
            selectSession(sessions[0])
            return
        }
        selectSession(sessions[(index + 1) % sessions.count])
    }

    func selectPreviousSession() {
        guard !sessions.isEmpty else { return }
        guard let selectedSession,
              let index = sessions.firstIndex(of: selectedSession) else {
            selectSession(sessions[0])
            return
        }
        selectSession(sessions[(index - 1 + sessions.count) % sessions.count])
    }

    func updateWindowPresentation(
        frame: WindowFrameState?,
        isZoomed: Bool,
        isFullscreen: Bool
    ) {
        if let frame { restoredFrame = frame }
        restoredIsZoomed = isZoomed
        restoredIsFullscreen = isFullscreen
        persistWindowState()
    }

    private func persistWindowState() {
        storage.update(WindowState(
            id: windowStateID,
            frame: restoredFrame,
            isZoomed: restoredIsZoomed,
            isFullscreen: restoredIsFullscreen,
            sessions: sessions.map { $0.snapshot() },
            selectedSessionID: selectedSession?.id
        ))
    }

    private func observeSelectedSession() {
        selectedSessionObservation = selectedSession?.objectWillChange.sink { [weak self] _ in
            DispatchQueue.main.async { self?.objectWillChange.send() }
        }
    }

    private func bindPersistence(_ session: TerminalSession) {
        session.setPersistenceHandler { [weak self, weak session] in
            guard let self, session != nil, !AppTermination.isTerminating else { return }
            self.persistWindowState()
        }
    }
}
