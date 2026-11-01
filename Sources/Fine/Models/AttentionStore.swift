import Foundation
import Combine

enum AttentionState: String, Codable, CaseIterable {
    case working, waiting, blocked, done, error, unknown

    var needsAttention: Bool { self == .waiting || self == .blocked || self == .error }
    var priority: Int {
        switch self {
        case .error: return 5
        case .blocked: return 4
        case .waiting: return 3
        case .unknown: return 2
        case .working: return 1
        case .done: return 0
        }
    }
    var label: String {
        switch self {
        case .working: return "작업 중"
        case .waiting: return "답변 필요"
        case .blocked: return "도움 필요"
        case .done: return "완료"
        case .error: return "오류"
        case .unknown: return "상태 확인 필요"
        }
    }
}

struct AttentionItem: Codable, Equatable, Identifiable {
    let id: String
    let key: String
    let host: String
    let source: String
    let fingerprint: String
    var title: String
    var message: String
    var state: AttentionState
    var updatedAt: Date
    /// The sender's tmux session. Optional so history written before grouping still loads.
    var workspace: String? = nil

    var address: String { source.isEmpty ? host : "\(host):\(source)" }
    /// The group the notch shows this under: a tmux session, Fine itself, or the host.
    var group: String {
        if let workspace, !workspace.isEmpty { return workspace }
        return source.hasPrefix("fine:") ? "Fine" : host
    }
    var json: [String: Any] {
        ["id": id, "key": key, "host": host, "source": source,
         "fingerprint": fingerprint, "title": title, "message": message,
         "state": state.rawValue, "updatedAt": ISO8601DateFormatter().string(from: updatedAt),
         "workspace": workspace ?? ""]
    }
    /// Hook keys name one harness conversation, which lives in exactly one terminal.
    var isSessionKey: Bool {
        key.range(of: "^[a-z][a-z0-9-]*:[0-9a-f][0-9a-f-]{7,}$", options: .regularExpression) != nil
    }
}

struct AttentionError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

/// Explicit events are authoritative. Silence is never interpreted as completion
/// or a question: old working events become unknown until their producer reports again.
@MainActor
final class AttentionStore: ObservableObject {
    static let shared = AttentionStore(file: FinePaths.home.appendingPathComponent(".fine/attention.json"))
    @Published private(set) var items: [AttentionItem] = []
    var onAttention: (() -> Void)?
    private let file: URL?
    private var expiry: Timer?
    /// sm이 노치를 가진 맥이면 이 저장소는 sm 노치를 비추는 거울이다(SmNotch): 올리기·지우기는 sm으로 보내고,
    /// 목록은 sm에서 받아 둔다. 파일은 쓰지 않는다 — 원본은 sm이다.
    private(set) var mirrorsSm = false
    private var mirrorTimer: Timer?
    static let capacity = 200
    static let workingLease: TimeInterval = 3600
    static let doneLifetime: TimeInterval = 30

    init(file: URL? = nil) {
        self.file = file
        if let file, FileManager.default.fileExists(atPath: file.path) {
            do { items = try JSONDecoder().decode([AttentionItem].self, from: Data(contentsOf: file)) }
            catch { NSLog("Fine attention history could not be loaded: %@", String(describing: error)) }
        }
    }

    var ordered: [AttentionItem] {
        items.sorted { a, b in
            if a.state.priority != b.state.priority { return a.state.priority > b.state.priority }
            return a.updatedAt > b.updatedAt
        }
    }
    var waitingCount: Int { items.filter { $0.state.needsAttention }.count }
    var workingCount: Int { items.filter { $0.state == .working }.count }

    /// sm 노치의 거울로 바꾼다(앱 시작 때 한 번). 목록은 3초마다, 그리고 올린 직후에 다시 받는다.
    func mirrorSm() {
        guard !mirrorsSm else { return }
        mirrorsSm = true
        expiry?.invalidate(); expiry = nil
        refreshMirror()
        mirrorTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.refreshMirror() }
        }
        mirrorTimer?.tolerance = 1
    }

    private func refreshMirror() {
        DispatchQueue.global(qos: .utility).async { [weak self] in
            guard let list = try? SmNotch.list() else { return }
            DispatchQueue.main.async {
                MainActor.assumeIsolated {
                    guard let self, self.mirrorsSm, list != self.items else { return }
                    self.items = list
                }
            }
        }
    }

    @discardableResult
    func post(_ args: [String: Any], now: Date = Date()) throws -> AttentionItem {
        if mirrorsSm {
            // sm 노치에 올리고, 돌아온 항목을 거울에 바로 반영한다(사이드바 점이 3초를 기다리지 않게).
            let result = try SmNotch.request("attention.post", args)
            guard let json = result as? [String: Any], let item = AttentionItem(json: json) else {
                throw AttentionError("sm returned no notification")
            }
            items = items.filter { $0.id != item.id } + [item]
            return item
        }
        func field(_ name: String, default fallback: String = "", max: Int) throws -> String {
            if let value = args[name], !(value is String) { throw AttentionError("\(name) must be a string") }
            let value = (args[name] as? String ?? fallback).trimmingCharacters(in: .whitespacesAndNewlines)
            guard value.utf8.count <= max, !value.contains("\0") else { throw AttentionError("invalid or oversized \(name)") }
            return value
        }
        let host = try field("host", default: "local", max: 100)
        let source = try field("source", max: 100)
        let key = try field("key", default: UUID().uuidString.lowercased(), max: 160)
        let title = try field("title", default: "에이전트", max: 300)
        let message = try field("message", max: 8000)
        let fingerprint = try field("fingerprint", max: 120)
        let workspace = try field("workspace", max: 100)
        guard host.range(of: "^[A-Za-z0-9][A-Za-z0-9_.-]*$", options: .regularExpression) != nil,
              !key.isEmpty, !title.isEmpty else { throw AttentionError("host, key and title are required") }
        // sm:NAME is an sm session (no tmux pane or Fine tab); AttentionRouter opens it with `sm reveal`.
        guard source.isEmpty || source.range(of: "^(%[0-9]+|[a-z0-9]{4}|fine:[a-fA-F0-9-]{36}|sm:[A-Za-z0-9_][A-Za-z0-9_.-]{0,63})$", options: .regularExpression) != nil else {
            throw AttentionError("source must be a Fine UUID, tmux pane, stable key or sm:NAME")
        }
        if source.hasPrefix("fine:"), UUID(uuidString: String(source.dropFirst(5))) == nil {
            throw AttentionError("invalid Fine tab UUID")
        }
        guard let state = AttentionState(rawValue: try field("state", default: "waiting", max: 20)) else {
            throw AttentionError("state must be working|waiting|blocked|done|error|unknown")
        }
        // JSON encoding avoids collisions when keys contain separators.
        let identity = try JSONEncoder().encode([host, source.lowercased(), key]).base64EncodedString()
        let item = AttentionItem(id: identity, key: key, host: host, source: source.lowercased(),
                                 fingerprint: fingerprint, title: title, message: message, state: state, updatedAt: now,
                                 workspace: workspace.isEmpty ? nil : workspace)
        // A resumed conversation reports from its new tab or pane; the old address is gone.
        let moved = { (other: AttentionItem) in
            item.isSessionKey && other.host == item.host && other.key == item.key && other.id != identity
        }
        let old = items.first { $0.id == identity } ?? items.first(where: moved)
        var next = items.filter { $0.id != identity && !moved($0) }
        guard next.count < Self.capacity else { throw AttentionError("notification queue is full; dismiss an existing item") }
        next.append(item)
        try commit(next)
        let changed = old?.state != state || old?.message != message || old?.title != title
        if state.needsAttention && changed { onAttention?() }
        scheduleExpiry(now: now)
        return item
    }

    func dismiss(id: String) throws {
        if mirrorsSm {
            _ = try SmNotch.request("attention.dismiss", ["id": id])
            items = items.filter { $0.id != id }
            return
        }
        guard items.contains(where: { $0.id == id }) else { throw AttentionError("notification not found") }
        try commit(items.filter { $0.id != id })
        scheduleExpiry()
    }

    func expire(now: Date = Date()) throws {
        let next = items.compactMap { original -> AttentionItem? in
            var item = original
            let age = now.timeIntervalSince(item.updatedAt)
            if item.state == .done && age >= Self.doneLifetime { return nil }
            if item.state == .working && age >= Self.workingLease { item.state = .unknown }
            return item
        }
        if next != items { try commit(next) }
        scheduleExpiry(now: now)
    }

    func start() {
        guard !mirrorsSm else { return }
        do { try expire() } catch { NSLog("Fine attention expiry failed: %@", String(describing: error)) } }

    private func commit(_ next: [AttentionItem]) throws {
        if let file {
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONEncoder().encode(next)
            try data.write(to: file, options: [.atomic, .completeFileProtectionUnlessOpen])
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
        }
        items = next
    }

    private func scheduleExpiry(now: Date = Date()) {
        expiry?.invalidate(); expiry = nil
        let deadline = items.compactMap { item -> Date? in
            switch item.state {
            case .working: return item.updatedAt.addingTimeInterval(Self.workingLease)
            case .done: return item.updatedAt.addingTimeInterval(Self.doneLifetime)
            default: return nil
            }
        }.min()
        guard let deadline else { return }
        expiry = Timer.scheduledTimer(withTimeInterval: max(0.1, deadline.timeIntervalSince(now)), repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                do { try self?.expire() } catch { NSLog("Fine attention expiry failed: %@", String(describing: error)) }
            }
        }
        expiry?.tolerance = 1
    }
}
