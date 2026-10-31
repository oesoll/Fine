import Foundation

/// Compact, append-aware metadata. Never retain the transcript or terminal output.
/// Truncation, replacement and same-size rewrites restart the index. Growing
/// files are treated as append-only JSONL; a future in-place editor would need
/// a version marker or explicit invalidation. Oversized tool records are skipped at a bounded line size.
struct TranscriptTitleIndex {
    struct Metadata: Equatable {
        var aiTitle: String?
        var firstUserTitle: String?
        /// 마지막으로 말을 주고받은 시각. 파일 수정 시각은 resume이 덧붙이는 기록(cost-state 등)으로도
        /// 바뀌어, Fine을 재시작하면 열린 대화가 전부 "방금"이 됐다(2026-10-27).
        var lastActivity: Date?
        var title: String? { aiTitle ?? firstUserTitle }
    }
    private struct Entry {
        var offset: UInt64 = 0
        var modified: Date = .distantPast
        var inode: UInt64 = 0
        var partial = Data()
        var skippingLine = false
        var metadata = Metadata()
    }
    static let chunkSize = 65_536
    static let maximumLineBytes = 262_144
    private static let titleMarker = Data("\"ai-title\"".utf8)
    private static let userMarker = Data("\"user\"".utf8)
    // 최상위 키만 맞는다. 본문 안의 JSON 글자는 따옴표가 \"로 이스케이프돼 이 바이트열이 되지 않는다.
    private static let userTypeMarker = Data("\"type\":\"user\"".utf8)
    private static let assistantTypeMarker = Data("\"type\":\"assistant\"".utf8)
    private static let timestampMarker = Data("\"timestamp\":\"".utf8)
    private static let timestampFormat: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
    private var entries: [String: Entry] = [:]
    private(set) var bytesRead = 0
    var cachedFileCount: Int { entries.count }

    mutating func metadata(for url: URL) -> Metadata? {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path),
              let size = attributes[.size] as? NSNumber,
              let modified = attributes[.modificationDate] as? Date else { return nil }
        let length = size.uint64Value
        let inode = (attributes[.systemFileNumber] as? NSNumber)?.uint64Value ?? 0
        var entry = entries[url.path] ?? Entry()
        if entry.inode != inode || length < entry.offset || (length == entry.offset && modified != entry.modified) {
            entry = Entry()
        }
        if length != entry.offset {
            guard let handle = try? FileHandle(forReadingFrom: url) else { return entry.metadata }
            defer { try? handle.close() }
            do {
                try handle.seek(toOffset: entry.offset)
                while entry.offset < length {
                    let count = min(Self.chunkSize, Int(length - entry.offset))
                    guard let chunk = try handle.read(upToCount: count), !chunk.isEmpty else { break }
                    bytesRead += chunk.count
                    entry.offset += UInt64(chunk.count)
                    consume(chunk, into: &entry)
                }
            } catch { return entry.metadata }
        }
        entry.modified = modified
        entry.inode = inode
        entries[url.path] = entry
        // Accept a complete final record without a newline, retaining its bytes
        // so a later append can still complete or extend the record correctly.
        var result = entry.metadata
        if !entry.skippingLine { parse(entry.partial, into: &result) }
        return result
    }

    mutating func retain(paths: Set<String>) { entries = entries.filter { paths.contains($0.key) } }

    private func consume(_ chunk: Data, into entry: inout Entry) {
        var start = chunk.startIndex
        while start < chunk.endIndex {
            let end = chunk[start...].firstIndex(of: 10) ?? chunk.endIndex
            if !entry.skippingLine {
                if entry.partial.count + end - start <= Self.maximumLineBytes {
                    entry.partial.append(chunk[start..<end])
                } else {
                    entry.partial.removeAll(keepingCapacity: false)
                    entry.skippingLine = true
                }
            }
            if end < chunk.endIndex {
                if !entry.skippingLine { parse(entry.partial, into: &entry.metadata) }
                entry.partial.removeAll(keepingCapacity: entry.partial.count <= 4096)
                entry.skippingLine = false
                start = end + 1
            } else { break }
        }
    }

    private func parse(_ line: Data, into metadata: inout Metadata) {
        if let stamp = Self.activityStamp(in: line), stamp > (metadata.lastActivity ?? .distantPast) {
            metadata.lastActivity = stamp
        }
        guard !line.isEmpty,
              line.range(of: Self.titleMarker) != nil ||
                (metadata.firstUserTitle == nil && line.range(of: Self.userMarker) != nil),
              let object = try? JSONSerialization.jsonObject(with: line) as? [String: Any] else { return }
        if object["type"] as? String == "ai-title", let raw = object["aiTitle"] as? String {
            let title = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if !title.isEmpty { metadata.aiTitle = String(title.prefix(240)) }
        } else if metadata.firstUserTitle == nil, object["type"] as? String == "user",
                  let message = object["message"] as? [String: Any], let raw = message["content"] as? String {
            let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty, !text.hasPrefix("<"), !text.hasPrefix("Caveat:"),
                  !text.hasPrefix("[Request interrupted") else { return }
            metadata.firstUserTitle = String(text.replacingOccurrences(of: "\n", with: " ").prefix(240))
        }
    }

    /// 사람이나 모델이 말한 기록의 시각만 센다. JSON 전체를 풀지 않고 바이트로 찾는다 —
    /// 첫 읽기는 수십 MB 대화를 끝까지 훑으므로 줄마다 파싱하면 비싸다.
    private static func activityStamp(in line: Data) -> Date? {
        guard line.range(of: userTypeMarker) != nil || line.range(of: assistantTypeMarker) != nil,
              let marker = line.range(of: timestampMarker),
              let end = line[marker.upperBound...].firstIndex(of: UInt8(ascii: "\"")),
              let text = String(data: line[marker.upperBound..<end], encoding: .utf8) else { return nil }
        return timestampFormat.date(from: text)
    }
}
