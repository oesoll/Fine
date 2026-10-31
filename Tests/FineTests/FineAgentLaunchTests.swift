import XCTest
@testable import Fine

final class FineAgentLaunchTests: XCTestCase {
    func testShellRunsUnderAgentWhenBundled() throws {
        let bundle = FileManager.default.temporaryDirectory
            .appendingPathComponent("FineAgentLaunch-\(UUID().uuidString).app")
        defer { try? FileManager.default.removeItem(at: bundle) }
        let macOS = bundle.appendingPathComponent("Contents/Helpers/FineAgent.app/Contents/MacOS")
        try FileManager.default.createDirectory(at: macOS, withIntermediateDirectories: true)
        let agent = macOS.appendingPathComponent("fine-agent")
        try Data("#!/bin/sh\n".utf8).write(to: agent)
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: agent.path)

        let launch = TerminalSession.agentWrapped(
            executable: "/bin/zsh", execName: "-zsh", arguments: ["-ilc", "exec claude"], bundleURL: bundle
        )
        XCTAssertEqual(launch.executable, agent.path)
        XCTAssertEqual(launch.execName, "fine-agent")
        XCTAssertEqual(launch.arguments, ["/bin/zsh", "-zsh", "-ilc", "exec claude"])
    }

    func testShellRunsDirectlyWithoutAgent() {
        let launch = TerminalSession.agentWrapped(
            executable: "/bin/zsh", execName: "-zsh", arguments: ["-ilc", "exec claude"],
            bundleURL: URL(fileURLWithPath: "/nonexistent/Fine.app")
        )
        XCTAssertEqual(launch.executable, "/bin/zsh")
        XCTAssertEqual(launch.execName, "-zsh")
        XCTAssertEqual(launch.arguments, ["-ilc", "exec claude"])
    }
}
