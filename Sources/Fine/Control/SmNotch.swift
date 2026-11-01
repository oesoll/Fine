import Foundation

/// 알림 노치는 sm(SpaceManager)이 갖는다 — 알림이 한 곳에 모이게. sm이 있는 맥에서 Fine은
/// 노치를 띄우지 않고, 제어 소켓의 attention.* 에는 'unknown command'로 답한다 — 그 답을 받은 sm이 노치를
/// 이어받는다(sm 5bbe686). Fine 탭의 알림은 sm 소켓으로 보내고, 사이드바 상태 점은 sm의 목록을 받아 그린다.
///
/// sm이 없는 기계(공개 Fine)는 지금처럼 Fine이 노치를 갖는다.
/// 한계: sm 앱이 잠깐 내려가 있으면 그 사이 Fine 탭의 알림은 버려진다(로그만 남긴다). sm이 노치를 가진 뒤로
/// 알림의 원본은 sm이라, Fine이 따로 쌓아 두었다가 다시 보내지 않는다 — 문제가 되면 여기서 짧게 모아 다시 보낸다.
enum SmNotch {
    static var socketPath: String {
        ProcessInfo.processInfo.environment["FINE_SM_SOCKET"]
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".space-manager/control.sock").path
    }

    /// 이 맥에서 노치가 sm의 것인가. sm CLI(SpaceManager 앱)가 깔려 있으면 그렇다. 시험 프로세스는 아니다.
    static var ownsNotch: Bool {
        let env = ProcessInfo.processInfo.environment
        if env["FINE_SM_NOTCH"] == "0" { return false }
        if NSClassFromString("XCTestCase") != nil, env["FINE_SM_NOTCH"] != "1" { return false }
        return SmSessionBridge.smCLI != nil
    }

    struct Failure: Error, CustomStringConvertible { let description: String }

    /// sm 제어 소켓에 JSON 한 줄을 보내고 result를 받는다(Fine 제어 소켓과 같은 모양). 블로킹, 1초 제한.
    static func request(_ command: String, _ args: [String: Any] = [:]) throws -> Any {
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { throw Failure(description: "socket: \(String(cString: strerror(errno)))") }
        defer { close(fd) }
        var timeout = timeval(tv_sec: 1, tv_usec: 0)
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        let path = Array(socketPath.utf8CString)
        guard path.count <= MemoryLayout.size(ofValue: address.sun_path) else { throw Failure(description: "socket path too long") }
        withUnsafeMutableBytes(of: &address.sun_path) { $0.copyBytes(from: path.map { UInt8(bitPattern: $0) }) }
        let connected = withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(fd, $0, socklen_t(MemoryLayout<sockaddr_un>.size)) }
        }
        guard connected == 0 else { throw Failure(description: "sm is not running (\(socketPath))") }
        var payload = try JSONSerialization.data(withJSONObject: ["command": command, "args": args])
        payload.append(UInt8(ascii: "\n"))
        let written = payload.withUnsafeBytes { write(fd, $0.baseAddress, $0.count) }
        guard written == payload.count else { throw Failure(description: "write failed") }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 65536)
        while data.last != UInt8(ascii: "\n") {
            let count = read(fd, &buffer, buffer.count)
            guard count > 0 else { break }
            data.append(buffer, count: count)
        }
        guard let response = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw Failure(description: "bad response from sm")
        }
        guard response["ok"] as? Bool == true else {
            throw Failure(description: response["error"] as? String ?? "sm refused \(command)")
        }
        return response["result"] ?? NSNull()
    }

    /// sm 노치의 지금 목록.
    static func list() throws -> [AttentionItem] {
        let result = try request("attention.list")
        return (result as? [[String: Any]] ?? []).compactMap(AttentionItem.init(json:))
    }

    /// 노치를 앞으로(메뉴 "에이전트 알림"). 기다리지 않는다.
    static func show() {
        DispatchQueue.global(qos: .userInitiated).async { _ = try? request("attention.show") }
    }
}

extension AttentionItem {
    /// 제어 소켓이 주고받는 모양(`json`)에서 되읽는다 — sm 노치의 목록이 이 모양이다.
    init?(json: [String: Any]) {
        guard let id = json["id"] as? String, let key = json["key"] as? String,
              let stateRaw = json["state"] as? String, let state = AttentionState(rawValue: stateRaw) else { return nil }
        let stamp = (json["updatedAt"] as? String).flatMap { ISO8601DateFormatter().date(from: $0) } ?? Date()
        let workspace = (json["workspace"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        self.init(id: id, key: key, host: json["host"] as? String ?? "local", source: json["source"] as? String ?? "",
                  fingerprint: json["fingerprint"] as? String ?? "", title: json["title"] as? String ?? "",
                  message: json["message"] as? String ?? "", state: state, updatedAt: stamp, workspace: workspace)
    }
}
