import Foundation

struct WindowFrameState: Codable, Equatable {
    var x: Double
    var y: Double
    var width: Double
    var height: Double
}

/// A terminal process cannot survive an app restart. Fine persists the durable
/// provider conversation identity and recreates the PTY by resuming it.
struct QuickSessionSnapshot: Codable, Equatable, Identifiable {
    let id: UUID
    var name: String
    var conversationID: String?
    var configuration: QuickSessionConfiguration
    /// 사용자가 직접 붙인 이름인가. 그렇다면 하네스가 만든 제목이 덮지 않는다.
    /// 예전 상태 파일에는 없던 항목이라 optional이다.
    var isNameUserSet: Bool?
    /// 이 탭을 띄운(또는 사용자가 묶어 둔) 메인 탭. 사이드바에서 그 아래 한 단 들여 보인다.
    var parentID: UUID?
    /// sm 모드에서 이 탭이 보는 sm 세션 이름. Fine을 다시 띄우면 이 이름으로 다시 붙는다.
    var smSessionName: String? = nil
}

struct WindowState: Codable, Identifiable, Equatable {
    let id: UUID
    var frame: WindowFrameState?
    var isZoomed: Bool?
    var isFullscreen: Bool?
    /// Optional for compatibility with Fine state files written before session restoration.
    var sessions: [QuickSessionSnapshot]? = nil
    var selectedSessionID: UUID? = nil

    var resolvedIsZoomed: Bool { isZoomed ?? false }
    var resolvedIsFullscreen: Bool { isFullscreen ?? false }
}

final class WindowStateStorage {
    static let shared = WindowStateStorage()

    private let fileManager: FileManager
    private let stateFile: URL
    private(set) var states: [WindowState]
    private var claimedIDs: Set<UUID> = []

    init(
        fileManager: FileManager = .default,
        stateFile: URL? = nil
    ) {
        self.fileManager = fileManager
        let directory = FinePaths.home
            .appendingPathComponent(".fine", isDirectory: true)
        self.stateFile = stateFile ?? directory.appendingPathComponent("window-states.json")
        try? fileManager.createDirectory(at: self.stateFile.deletingLastPathComponent(), withIntermediateDirectories: true)
        states = (try? Data(contentsOf: self.stateFile))
            .flatMap { try? JSONDecoder().decode([WindowState].self, from: $0) } ?? []
    }

    func claim(id: UUID) -> WindowState? {
        guard let state = Self.exactUnclaimedState(id: id, states: states, claimedIDs: claimedIDs) else {
            return nil
        }
        claimedIDs.insert(id)
        return state
    }

    func claimNext() -> WindowState? {
        guard let state = states.first(where: { !claimedIDs.contains($0.id) }) else { return nil }
        claimedIDs.insert(state.id)
        return state
    }

    func registerClaimed(_ id: UUID) { claimedIDs.insert(id) }
    func contains(id: UUID) -> Bool { states.contains { $0.id == id } }
    func unclaimedStates() -> [WindowState] { states.filter { !claimedIDs.contains($0.id) } }

    func update(_ state: WindowState) {
        if let index = states.firstIndex(where: { $0.id == state.id }) {
            states[index] = state
        } else {
            states.append(state)
        }
        save()
    }

    func remove(id: UUID) {
        claimedIDs.remove(id)
        states.removeAll { $0.id == id }
        save()
    }

    static func exactUnclaimedState(
        id: UUID,
        states: [WindowState],
        claimedIDs: Set<UUID>
    ) -> WindowState? {
        guard !claimedIDs.contains(id) else { return nil }
        return states.first { $0.id == id }
    }

    private func save() {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(states) else { return }
        try? data.write(to: stateFile, options: .atomic)
    }
}
