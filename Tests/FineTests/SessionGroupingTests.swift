import XCTest
@testable import Fine

/// 하위 탭 묶음: 탭 순서는 늘 "메인 탭 바로 아래 그 하위 탭"이고, 드래그로 묶고 푼다.
final class SessionGroupingTests: XCTestCase {
    private var directory: URL!

    override func setUp() {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: directory)
    }

    private func makeState(_ names: [String], parents: [String: String] = [:]) -> (AppState, WindowStateStorage, UUID) {
        let storage = WindowStateStorage(stateFile: directory.appendingPathComponent("windows.json"))
        let configurations = QuickSessionConfigurationStorage(stateFile: directory.appendingPathComponent("config.json"))
        let ids = Dictionary(uniqueKeysWithValues: names.map { ($0, UUID()) })
        let snapshots = names.map { name in
            QuickSessionSnapshot(id: ids[name]!, name: name, conversationID: nil,
                                 configuration: .defaultConfiguration(for: .claude),
                                 parentID: parents[name].flatMap { ids[$0] })
        }
        let windowID = UUID()
        storage.update(WindowState(id: windowID, sessions: snapshots))
        return (AppState(requestedWindowStateID: windowID, storage: storage, configurationStorage: configurations),
                storage, windowID)
    }

    private func layout(_ state: AppState) -> [String] {
        state.sessions.map { session in
            session.parentID.map { parent in
                "\(state.sessions.first { $0.id == parent }!.name)/\(session.name)"
            } ?? session.name
        }
    }

    private func id(_ state: AppState, _ name: String) -> UUID { state.sessions.first { $0.name == name }!.id }

    func testRestoredChildrenSitDirectlyUnderTheirParent() {
        let (state, _, _) = makeState(["a", "b", "c", "d"], parents: ["d": "a", "c": "x"])
        XCTAssertEqual(layout(state), ["a", "a/d", "b", "c"], "a missing parent is ungrouped")
    }

    func testDropInTheMiddleNestsAndSurvivesRestore() {
        let (state, storage, windowID) = makeState(["main", "glamping-1", "glamping-2", "other"])
        XCTAssertTrue(state.dropSession(id: id(state, "glamping-2"), onto: id(state, "main"), edge: .nest))
        XCTAssertTrue(state.dropSession(id: id(state, "glamping-1"), onto: id(state, "main"), edge: .nest))
        XCTAssertEqual(layout(state), ["main", "main/glamping-2", "main/glamping-1", "other"])
        let saved = storage.states.first { $0.id == windowID }?.sessions ?? []
        XCTAssertEqual(saved.filter { $0.parentID != nil }.count, 2)
    }

    func testOnlyOneLevelAndChildrenFollowTheirParent() {
        let (state, _, _) = makeState(["a", "b", "c"], parents: ["b": "a"])
        // 하위 탭 위에 묶어도 맨 위 탭의 묶음으로 간다.
        XCTAssertTrue(state.dropSession(id: id(state, "c"), onto: id(state, "b"), edge: .nest))
        XCTAssertEqual(layout(state), ["a", "a/b", "a/c"])
        // 묶음을 가진 메인 탭을 다른 묶음에 넣으면 그 하위 탭도 함께 옮겨 간다.
        let (other, _, _) = makeState(["p", "q", "q1"], parents: ["q1": "q"])
        XCTAssertTrue(other.dropSession(id: id(other, "q"), onto: id(other, "p"), edge: .nest))
        XCTAssertEqual(layout(other), ["p", "p/q", "p/q1"])
        // 자기 묶음 안으로는 묶이지 않는다.
        XCTAssertFalse(state.dropSession(id: id(state, "a"), onto: id(state, "b"), edge: .nest))
    }

    func testDroppingBetweenTopLevelRowsUngroups() {
        let (state, _, _) = makeState(["a", "b", "c"], parents: ["b": "a"])
        XCTAssertTrue(state.dropSession(id: id(state, "b"), onto: id(state, "c"), edge: .after))
        XCTAssertEqual(layout(state), ["a", "c", "b"])
        // 하위 탭이 달린 메인 탭의 바로 아래는 그 묶음의 첫 자리다.
        let (grouped, _, _) = makeState(["a", "a1", "b"], parents: ["a1": "a"])
        XCTAssertTrue(grouped.dropSession(id: id(grouped, "b"), onto: id(grouped, "a"), edge: .after))
        XCTAssertEqual(layout(grouped), ["a", "a/b", "a/a1"])
    }

    func testClosingTheMainTabReleasesItsChildren() {
        let (state, _, _) = makeState(["a", "a1", "a2", "b"], parents: ["a1": "a", "a2": "a"])
        state.removeSession(state.sessions[0])
        XCTAssertEqual(layout(state), ["a1", "a2", "b"])
        state.ungroupSession(id: id(state, "a1"))
        XCTAssertEqual(layout(state), ["a1", "a2", "b"])
    }

    func testAgentLaunchedTabNestsUnderTheCallerRoot() {
        let (state, _, _) = makeState(["main", "main-child"], parents: ["main-child": "main"])
        state.addSession(configuration: .defaultConfiguration(for: .claude), startImmediately: false,
                         parentID: id(state, "main-child"))
        XCTAssertEqual(state.sessions.count, 3)
        XCTAssertEqual(state.sessions[2].parentID, id(state, "main"))
        XCTAssertEqual(state.selectedSession?.id, state.sessions[2].id)
    }
}
