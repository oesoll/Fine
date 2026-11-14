import Foundation

func handleAttentionCLI(_ arguments: [String]) throws -> Bool {
    var argv = arguments
    if argv.first == "--json" { argv.removeFirst() }
    guard let command = argv.first, ["notify", "notifications"].contains(command) else { return false }
    argv.removeFirst()
    if argv.contains("--help") {
        print("""
        fine notify <message> [--id task] [--state waiting|blocked|working|done|error]
                    [--title title] [--host mac]
        fine notifications [list|show|hide|status|dismiss <id>|open <id>|snapshot <path>]

        --id identifies a task within the sender's session; reuse it to update/resolve.
        --host uses the existing tmux-bridge route (default: this machine).
        Plain shells can notify too; without a session address the card has no jump action.
        """)
        return true
    }
    if command == "notify" {
        var host = "local"
        if let index = argv.firstIndex(of: "--host") {
            guard index + 1 < argv.count else { throw CLIError(message: "--host requires a value") }
            host = argv[index + 1]
            argv.removeSubrange(index...index + 1)
        }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["tmux-bridge", "notify", host] + argv
        process.standardInput = FileHandle.standardInput
        process.standardOutput = FileHandle.standardOutput
        process.standardError = FileHandle.standardError
        try process.run(); process.waitUntilExit()
        if process.terminationStatus != 0 { throw CLIError(message: "notification was not delivered") }
        return true
    }
    let operation = argv.first ?? "list"
    let args: [String: Any]
    switch operation {
    case "list", "show", "hide", "status": args = [:]
    case "dismiss", "open", "snapshot":
        guard argv.count == 2 else { throw CLIError(message: "fine notifications \(operation) <\(operation == "snapshot" ? "path" : "id")>") }
        args = [operation == "snapshot" ? "path" : "id": argv[1]]
    default: throw CLIError(message: "unknown notifications command")
    }
    let response: [String: Any]
    do {
        response = try send("attention." + operation, args)
    } catch let error as CLIError where error.message.hasPrefix("unknown command: attention.") {
        // 이 맥에선 노치가 sm의 것이다(Fine이 attention.* 를 내놓았다). 같은 일을 sm CLI로 한다.
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        guard let sm = [home + "/bin/sm", home + "/.local/bin/sm", "/opt/homebrew/bin/sm", "/usr/local/bin/sm"]
            .first(where: { FileManager.default.isExecutableFile(atPath: $0) }) else { throw error }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: sm)
        process.arguments = ["notch", operation] + argv.dropFirst()
        try process.run(); process.waitUntilExit()
        exit(process.terminationStatus)
    }
    let data = try JSONSerialization.data(withJSONObject: response["result"] ?? NSNull(), options: [.prettyPrinted, .sortedKeys])
    print(String(decoding: data, as: UTF8.self))
    return true
}
