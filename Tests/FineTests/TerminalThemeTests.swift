import XCTest
@testable import Fine

final class TerminalThemeTests: XCTestCase {
    static let ansi16 = [
        "black", "red", "green", "yellow", "blue", "magenta", "cyan", "white",
        "brightBlack", "brightRed", "brightGreen", "brightYellow",
        "brightBlue", "brightMagenta", "brightCyan", "brightWhite",
    ]

    static func contrast(_ a: String, _ b: String) throws -> Double {
        func luminance(_ hex: String) throws -> Double {
            let value = try XCTUnwrap(Int(hex.dropFirst(), radix: 16))
            func channel(_ shift: Int) -> Double {
                let c = Double((value >> shift) & 0xff) / 255
                return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
            }
            return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
        }
        let (x, y) = (try luminance(a), try luminance(b))
        return (max(x, y) + 0.05) / (min(x, y) + 0.05)
    }

    func testEveryANSISlotIsAnExplicitColorAndHuesAreDistinct() throws {
        for isDark in [false, true] {
            let colors = TerminalPalette.forHarness(.claude, isDark: isDark).colors
            for key in Self.ansi16 {
                XCTAssertTrue(try XCTUnwrap(colors[key]).hasPrefix("#"), key)
            }
            // 단색으로 눌러 위계를 지우던 정책으로 돌아가지 않는다.
            let accents = ["red", "green", "yellow", "blue", "magenta", "cyan", "brightBlue", "brightRed"]
            XCTAssertEqual(Set(accents.compactMap { colors[$0] }).count, accents.count)
            XCTAssertNotNil(TerminalPalette.forHarness(.claude, isDark: isDark).json)
        }
    }

    /// Claude `*-ansi` 테마의 실제 출력: 97은 본문 강조, 37은 보조 글자, 94는 인라인 코드·링크.
    /// 이름이 아니라 역할로 읽혀야 한다 — 라이트에서 97이 희면 흰 바탕에서 사라진다.
    func testClaudeANSIRolesReadOnBothBackgrounds() throws {
        for isDark in [false, true] {
            let palette = TerminalPalette.forHarness(.claude, isDark: isDark)
            let c = palette.colors
            let bg = try XCTUnwrap(c["background"])
            let emphasis = try Self.contrast(XCTUnwrap(c["brightWhite"]), bg)
            let body = try Self.contrast(XCTUnwrap(c["foreground"]), bg)
            let secondary = try Self.contrast(XCTUnwrap(c["white"]), bg)
            XCTAssertGreaterThanOrEqual(emphasis, body, "강조는 본문보다 약하면 안 된다")
            XCTAssertGreaterThan(body, secondary, "보조 글자는 본문보다 한 단 물러나야 한다")
            XCTAssertGreaterThanOrEqual(secondary, 4.5)
            for key in ["red", "green", "yellow", "blue", "magenta", "cyan", "brightBlue", "brightRed"] {
                XCTAssertGreaterThanOrEqual(try Self.contrast(XCTUnwrap(c[key]), bg), 4.5, "\(isDark ? "dark" : "light") \(key)")
            }
            // truecolor로 직접 칠하는 Codex 강조색을 반대 테마에서도 읽히게 하는 안전망.
            XCTAssertEqual(palette.minimumContrastRatio, 4.5)
        }
    }

    func testOneRolePaletteServesEveryHarness() {
        for isDark in [false, true] {
            let claude = TerminalPalette.forHarness(.claude, isDark: isDark)
            for harness in [QuickHarness.codex, .opencode, .omp] {
                XCTAssertEqual(TerminalPalette.forHarness(harness, isDark: isDark), claude)
            }
        }
    }
}

extension TerminalThemeTests {
    /// 제출된 프롬프트 바탕은 라이트에서 바탕보다 어둡고, 다크에서는 바탕보다 밝아야 한다.
    func testClaudePromptSurfaceFlipsWithTheScheme() throws {
        func luminance(_ hex: String) throws -> Double {
            let value = try XCTUnwrap(Int(hex.dropFirst(), radix: 16))
            let r = Double((value >> 16) & 0xff), g = Double((value >> 8) & 0xff), b = Double(value & 0xff)
            return (0.299 * r + 0.587 * g + 0.114 * b) / 255
        }
        let light = TerminalPalette.forHarness(.claude, isDark: false)
        let dark = TerminalPalette.forHarness(.claude, isDark: true)
        try XCTAssertLessThan(luminance(XCTUnwrap(light.colors["brightBlack"])),
                              luminance(XCTUnwrap(light.colors["background"])))
        try XCTAssertGreaterThan(luminance(XCTUnwrap(dark.colors["brightBlack"])),
                                 luminance(XCTUnwrap(dark.colors["background"])))
        XCTAssertEqual(dark.minimumContrastRatio, 4.5)
    }
}

extension TerminalThemeTests {
    /// 상태줄은 xterm 밖에서 CSS가 그린다. 팔레트가 자기 밝기를 들고 있어야 같이 뒤집힌다.
    func testPaletteCarriesItsSchemeForChromeOutsideXterm() {
        XCTAssertFalse(TerminalPalette.forHarness(.claude, isDark: false).isDark)
        XCTAssertFalse(TerminalPalette.forHarness(.codex, isDark: false).isDark)
        XCTAssertTrue(TerminalPalette.forHarness(.claude, isDark: true).isDark)
        XCTAssertTrue(TerminalPalette.forHarness(.omp, isDark: true).isDark)
    }

    /// 터미널 바탕은 홈의 남색이 아니라 중립적인 짙은 회색이어야 한다.
    func testDarkTerminalBackgroundIsNeutralGrey() throws {
        let hex = try XCTUnwrap(TerminalPalette.forHarness(.codex, isDark: true).colors["background"])
        let value = try XCTUnwrap(Int(hex.dropFirst(), radix: 16))
        let r = (value >> 16) & 0xff, g = (value >> 8) & 0xff, b = value & 0xff
        // 채널이 서로 가까워야 중립이다. 남색이면 파랑이 빨강보다 한참 높다.
        XCTAssertLessThanOrEqual(abs(r - b), 6, "배경에 색이 돈다: \(hex)")
        XCTAssertLessThanOrEqual(abs(r - g), 6, "배경에 색이 돈다: \(hex)")
    }
}

extension TerminalThemeTests {
    /// 선택 색은 세 가지를 다 줘야 한다. 하나라도 비우면 그 상태에서 xterm의 기본값이
    /// 나오는데, 그 회색은 밝은 바탕에서 검게, 어두운 바탕에서 희게 보인다.
    func testSelectionIsFullySpecifiedInBothSchemes() throws {
        for isDark in [false, true] {
            let palette = TerminalPalette.forHarness(.claude, isDark: isDark)
            for key in ["selectionBackground", "selectionInactiveBackground", "selectionForeground"] {
                let value = try XCTUnwrap(palette.colors[key], "\(isDark ? "dark" : "light") \(key)")
                XCTAssertTrue(value.hasPrefix("#"), "\(key) = \(value)")
            }
            // 선택 위의 글자는 바탕이 아니라 선택면 위에서 읽힌다.
            XCTAssertNotEqual(palette.colors["selectionForeground"], palette.colors["selectionBackground"])
        }
    }
}
