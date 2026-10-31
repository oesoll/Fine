import Foundation
import GhosttyTerminal

/// 터미널(libghostty)에 입히는 팔레트. 라이트는 흰 바탕, 다크는 중립 짙은 회색 바탕이다.
/// 색 이름은 xterm.js 시절 그대로다 — GhosttyTheme가 같은 이름을 Ghostty 설정으로 옮긴다.
struct TerminalPalette: Equatable {
    let colors: [String: String]
    var minimumContrastRatio: Double = 1
    /// 상태줄처럼 xterm 밖에서 그리는 장식도 같이 뒤집어야 한다.
    var isDark: Bool = false

    /// ANSI 16색은 "색 이름"이 아니라 "역할"로 칠한다. Claude의 `*-ansi` 테마는 본문 강조를
    /// 97(밝은 흰색), 보조 글자를 37(흰색), 인라인 코드·링크를 94, 강조색을 91로 낸다
    /// (2026-10 실제 캡처). 그래서 라이트에서 97은 검정에 가깝고 37은 회색이어야 한다 —
    /// 글자 그대로의 흰색을 주면 흰 바탕에서 사라진다. 예전에는 그 문제를 16색 전부를 한 색으로
    /// 눌러서 피했고, 그 대가로 출력의 위계가 모두 지워졌다.
    ///
    /// 색은 glamour(claude-mods가 쓰는 charm 스타일)처럼 차분한 강조 몇 개만 둔다.
    /// truecolor로 직접 칠하는 Codex의 문법 강조는 팔레트가 닿지 않으므로
    /// `minimumContrastRatio`가 반대 테마용 색을 읽히는 쪽으로 끌어온다.
    static let quickLight = TerminalPalette(colors: [
        "background": "#ffffff",
        "foreground": "#1d1d1f",
        "cursor": "#1d1d1f",
        "cursorAccent": "#ffffff",
        // 셋을 다 지정해야 한다. 활성 선택만 주면 포커스가 빠진 순간 xterm의 기본
        // 회색이 나오고, 그것이 흰 바탕에서는 검은 덩어리로 보인다.
        "selectionBackground": "#c2dbff",
        "selectionInactiveBackground": "#dde7f4",
        "selectionForeground": "#000000",
        "black": "#1d1d1f",
        "red": "#b5412c",
        "green": "#2f7d3b",
        "yellow": "#93650a",
        "blue": "#2457b8",
        "magenta": "#8a46b0",
        "cyan": "#0f7782",
        "white": "#6e6e73",
        // Claude는 100(배경)을 제출한 프롬프트의 면으로 쓴다. 바탕보다 한 단 어두운 면.
        "brightBlack": "#eeeeec",
        "brightRed": "#c2552f",
        "brightGreen": "#2f8a45",
        "brightYellow": "#9c6d00",
        "brightBlue": "#2f6bd6",
        "brightMagenta": "#9a4fc4",
        "brightCyan": "#11808c",
        "brightWhite": "#111113",
    ], minimumContrastRatio: 4.5)

    /// 바탕은 작업부와 같은 짙은 회색이다. 홈 화면의 남색을 여기까지 끌고 오면
    /// 글을 읽는 면에 색이 돌아 눈이 피로하다 — 배경은 배경답게 중립이어야 한다.
    static let quickDark = TerminalPalette(colors: [
        "background": "#1e1e1e",
        "foreground": "#e4e4e6",
        "cursor": "#e8e8e8",
        "cursorAccent": "#1e1e1e",
        "selectionBackground": "#2f4a72",
        "selectionInactiveBackground": "#2b3442",
        "selectionForeground": "#f2f2f2",
        "black": "#48484c",
        "red": "#ef8a78",
        "green": "#93d29a",
        "yellow": "#e6c27a",
        "blue": "#7ea6f2",
        "magenta": "#c8a0f2",
        "cyan": "#72c9cf",
        "white": "#9d9da3",
        // 다크에서 제출된 프롬프트의 면은 바탕보다 한 단 밝다.
        "brightBlack": "#2c2c2e",
        "brightRed": "#e8865f",
        "brightGreen": "#a8e0a8",
        "brightYellow": "#f2d79b",
        "brightBlue": "#93b8ff",
        "brightMagenta": "#d8b8ff",
        "brightCyan": "#93ddd8",
        "brightWhite": "#f7f7f8",
    ], minimumContrastRatio: 4.5, isDark: true)

    /// 홈 장면 위의 대화 탭. 바탕은 비우고(SwiftUI가 반투명 검정을 깐다) 글자는 다크 역할색을 쓴다.
    /// 장면이 깔린 동안은 밝은 테마에서도 터미널은 어둡다 — 흐린 장면 위의 검은 유리다.
    static let overArtwork: TerminalPalette = {
        var colors = quickDark.colors
        colors["background"] = "rgba(0, 0, 0, 0)"
        colors["cursorAccent"] = "#000000"
        colors["brightBlack"] = "#2a2a2c"
        return TerminalPalette(colors: colors, minimumContrastRatio: 4.5, isDark: true)
    }()

    /// 지금 창에 맞는 팔레트. 홈 배경이 장면이면 장면 위 팔레트다.
    @MainActor static func current(_ harness: QuickHarness) -> TerminalPalette {
        HomeArtworkMode.isActive ? .overArtwork : .forHarness(harness, isDark: FineAppearance.isDarkNow)
    }

    /// 하네스마다 다른 팔레트를 둘 이유가 없어졌다 — 역할 팔레트 하나가 Claude의 ANSI
    /// 테마와 Codex의 이름 있는 색을 함께 받는다. 호출부가 하네스를 넘기는 자리는 남겨 둔다.
    static func forHarness(_ harness: QuickHarness, isDark: Bool = false) -> TerminalPalette {
        isDark ? .quickDark : .quickLight
    }

    var ghosttyTheme: GhosttyTheme {
        GhosttyTheme(colors: colors, minimumContrast: minimumContrastRatio)
    }

    var json: String? {
        guard let data = try? JSONSerialization.data(
            withJSONObject: colors,
            options: [.sortedKeys]
        ) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
