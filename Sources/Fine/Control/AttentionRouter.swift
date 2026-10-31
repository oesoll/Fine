import AppKit

@MainActor
enum AttentionRouter {
    static func open(_ item: AttentionItem) async throws {
        guard !item.source.isEmpty else { throw AttentionError("notification has no return address") }
        if item.source.hasPrefix("fine:"), item.host == localHost || item.host == "local" {
            let result = await withCheckedContinuation { continuation in
                ControlCommands.handle(ControlRequest(command: "tab.select", args: [
                    "tab": String(item.source.dropFirst(5)), "fingerprint": item.fingerprint
                ])) { continuation.resume(returning: $0) }
            }
            if case .error(let message) = result { throw AttentionError(message) }
            return
        }
        if item.source.hasPrefix("sm:") {
            // An sm session: the sm app finds the workspace and pane that show it (or opens one) and fronts it.
            let name = String(item.source.dropFirst(3))
            let host = item.host == localHost || item.host == "local" ? localHost : item.host
            let helper = FinePaths.home.appendingPathComponent("bin/sm")
            _ = try await run(helper.path, ["reveal", name + "@" + host])
            return
        }
        let output = try await runBridge(["focus", item.address, "--fingerprint", item.fingerprint])
        guard let data = output.data(using: .utf8),
              let location = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let session = location["session"] as? String else { return }
        // Focus the matching SM workspace after the owner selects the exact tmux
        // pane. Matching by host AND session avoids jumping to a same-named peer.
        let helper = FinePaths.home.appendingPathComponent("bin/sm")
        let workspaces = try await run(helper.path, ["--json", "ws"])
        guard let rows = try JSONSerialization.jsonObject(with: Data(workspaces.utf8)) as? [[String: Any]],
              let row = rows.first(where: {
                  ($0["tmuxSession"] as? String) == session &&
                  ($0["remoteHost"] as? String ?? "") == (item.host == localHost ? "" : item.host)
              }), let id = row["id"] as? String else { throw AttentionError("no SM workspace for this session") }
        _ = try await run(helper.path, ["ws", "select", id])
    }

    static var localHost: String {
        let config = ProcessInfo.processInfo.environment["TMUX_BRIDGE_CONFIG"].map { URL(fileURLWithPath: $0) }
            ?? FinePaths.home.appendingPathComponent(".smux")
        return (try? String(contentsOf: config.appendingPathComponent("hostname"), encoding: .utf8))?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? "local"
    }

    private static func runBridge(_ arguments: [String]) async throws -> String {
        let config = ProcessInfo.processInfo.environment["FINE_BRIDGE_BIN"]
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".smux/bin/tmux-bridge").path
        return try await run(config, arguments)
    }

    // Bridge/SSH is blocking I/O. Keep it off the UI thread and bound its lifetime;
    // no shell interpolation and no terminal input is involved in opening a source.
    private static func run(_ path: String, _ arguments: [String]) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let process = Process(), output = Pipe()
                process.executableURL = URL(fileURLWithPath: path)
                process.arguments = arguments
                process.standardOutput = output
                process.standardError = FileHandle.nullDevice
                do {
                    try process.run()
                    let timeout = DispatchWorkItem { if process.isRunning { process.terminate() } }
                    DispatchQueue.global().asyncAfter(deadline: .now() + 15, execute: timeout)
                    let data = output.fileHandleForReading.readDataToEndOfFile()
                    process.waitUntilExit()
                    timeout.cancel()
                    guard process.terminationStatus == 0 else { throw AttentionError("source unavailable") }
                    continuation.resume(returning: String(decoding: data, as: UTF8.self))
                } catch { continuation.resume(throwing: error) }
            }
        }
    }
}
