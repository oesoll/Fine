import AppKit
import SwiftUI
import Testing
@testable import Fine

@MainActor struct HomeContrastTests {
    @Test func pickerNavigationTracksThreeColumnGridWithoutWrappingEdges() {
        #expect(HomeBackgroundPicker.moved(from: .forest, direction: .right, columns: 3) == .aurora)
        #expect(HomeBackgroundPicker.moved(from: .forest, direction: .down, columns: 3) == .oceanSunset)
        #expect(HomeBackgroundPicker.moved(from: .forest, direction: .left, columns: 3) == .forest)
        #expect(HomeBackgroundPicker.moved(from: .plain, direction: .down, columns: 3) == .plain)
    }
}
