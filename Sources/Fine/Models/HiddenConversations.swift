import Foundation

/// 최근 대화 목록에서 뺄 세션 ID. CLI 전용 기능이라 UI는 없다 (`fine hide|unhide|hidden`).
/// 세션 ID는 하네스마다 고유하므로 하네스 구분 없이 ID만 저장한다. transcript는 건드리지 않아
/// `fine resume <id>`로는 여전히 열 수 있다.
enum HiddenConversations {
    static var file: URL { FinePaths.home.appendingPathComponent(".fine/hidden-conversations.json") }

    /// 스캐너가 5초마다 부르므로 매번 읽는다 — 수십 바이트짜리 파일이라 캐시보다 단순한 쪽을 택했다.
    static func load(from file: URL = file) -> Set<String> {
        guard let data = try? Data(contentsOf: file),
              let ids = try? JSONDecoder().decode([String].self, from: data) else { return [] }
        return Set(ids)
    }

    /// 바뀌었으면 true.
    @discardableResult
    static func set(_ id: String, hidden: Bool, in file: URL = file) throws -> Bool {
        var ids = load(from: file)
        let changed = hidden ? ids.insert(id).inserted : ids.remove(id) != nil
        guard changed else { return false }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        let data = try JSONEncoder.sortedPretty.encode(ids.sorted())
        try data.write(to: file, options: .atomic)
        return true
    }
}

private extension JSONEncoder {
    static var sortedPretty: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }
}
