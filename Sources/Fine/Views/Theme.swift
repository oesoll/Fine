import SwiftUI

enum FineTheme {
    static let sidebarWidth: CGFloat = 248
    static let sidebarInset: CGFloat = 12
    static let titlebarClearance: CGFloat = 40
    static let rowCornerRadius: CGFloat = 8
    static let rowVerticalPadding: CGFloat = 8
    static let rowHorizontalPadding: CGFloat = 10
    static let iconSize: CGFloat = 12
    static let iconFrame: CGFloat = 16
    static let compactControlHeight: CGFloat = 32
    static let compactControlRadius: CGFloat = 9
    static let composerCornerRadius: CGFloat = 14
    static let homeContentWidth: CGFloat = 680

    // 여기 색들은 뷰마다 colorScheme을 읽지 않고 상수로 쓰인다. 그래서 값 자체가
    // 창의 외형을 따라 풀려야 한다 — 검정 5%는 어두운 바탕에서 보이지 않고,
    // 흰 면은 어두운 패널 위에서 혼자 불을 켠 것처럼 튄다.
    static let workspace = Color(nsColor: .textBackgroundColor)
    static let divider = Color.adaptive(light: FinePalette.light.divider, dark: FinePalette.dark.divider)
    static let hoverFill = Color.adaptive(light: .black.opacity(0.04), dark: .white.opacity(0.05))
    static let selectedFill = Color.adaptive(light: FinePalette.light.selectedFill, dark: FinePalette.dark.selectedFill)
    static let selectedRim = Color.adaptive(light: FinePalette.light.selectedRim, dark: FinePalette.dark.selectedRim)
    static let controlFill = Color.adaptive(light: FinePalette.light.controlFill, dark: FinePalette.dark.controlFill)
    static let pickerRailFill = Color.adaptive(light: .black.opacity(0.018), dark: .white.opacity(0.025))
    /// 피커 레일에서 고른 칸. 밝은 쪽은 흰 면이 레일 위로 떠오르고, 어두운 쪽은 한 단만 밝힌다.
    static let pickerSelection = Color.adaptive(light: .white, dark: .white.opacity(0.11))
    static let overlayScrim = Color.adaptive(light: .black.opacity(0.06), dark: .black.opacity(0.32))
    static let overlayShadow = Color.adaptive(light: .black.opacity(0.14), dark: .black.opacity(0.5))
    static let overlayCornerRadius: CGFloat = 12
    static let glassSheenTop = Color.white.opacity(0.30)
    static let glassSheenMiddle = Color.white.opacity(0.10)
    static let glassTintBottom = Color(nsColor: .windowBackgroundColor).opacity(0.08)
    static let glassEdge = Color.adaptive(light: .black.opacity(0.08), dark: .white.opacity(0.10))
    /// 보내기 버튼. 어두운 쪽에서 짙은 녹색은 바탕에 묻히고, 흰 면은 밤 장면 위에서 혼자 튄다.
    /// 장면의 빛무리와 같은 푸른색으로 든다.
    static let sendFill = Color.adaptive(
        light: Color(red: 0.22, green: 0.27, blue: 0.23),
        dark: Color(red: 0.25, green: 0.42, blue: 0.88)
    )
    static let sendInk = Color.white
    /// 찾기 모드의 색. 대화를 시작하는 초록과 겹치지 않게 푸른 쪽으로 둔다.
    static let findAccent = Color.adaptive(
        light: Color(red: 0.24, green: 0.45, blue: 0.66),
        dark: Color(red: 0.47, green: 0.64, blue: 1.0)
    )
}

extension Color {
    /// 창의 실제 외형에 따라 풀리는 색. SwiftUI는 이 NSColor를 그리는 자리의
    /// 외형으로 풀어내므로, 정적 상수로 두어도 테마를 따라간다.
    static func adaptive(light: Color, dark: Color) -> Color {
        let light = NSColor(light), dark = NSColor(dark)
        return Color(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.aqua, .darkAqua]) == .darkAqua ? dark : light
        })
    }
}

/// 인사말처럼 큰 글자의 서체. 밝은 쪽에는 세리프가 어울리지만 어두운 쪽에서는
/// 가는 세리프 획이 배경에 먹혀 지저분해진다. 그쪽은 산세리프로 간다.
///
/// Pretendard가 깔려 있으면 그것을 쓰고, 없으면 시스템 서체로 떨어진다 —
/// `Font.custom`은 이름을 못 찾으면 조용히 시스템으로 돌아간다.
enum FineDisplayFont {
    /// 밝은 쪽도 세리프를 버렸다 — 한글은 명조로 떨어져 점묘 장면 위에서 획이 끊겨 보였다.
    /// 굵기는 Regular: 큰 글자를 가늘게 두고 마지막 어절의 색으로 힘을 준다(2026-10-27, 레퍼런스
    /// "kurage" 홈). SemiBold는 같은 크기에서 화면을 눌렀다.
    static func greeting(size: CGFloat, isDark: Bool) -> Font {
        .custom("Pretendard-Regular", size: size)
    }

    static func greetingTracking(isDark: Bool) -> CGFloat { -1.4 }
}

/// 홈 화면의 한글 글자. 인사말과 같은 서체로 맞춰야 한 화면이 한 목소리로 읽힌다.
enum FineHomeFont {
    static let note = Font.custom("Pretendard-Medium", size: 13)
    static let prompt = Font.custom("Pretendard-Regular", size: 16)
    static let caption = Font.custom("Pretendard-Medium", size: 12)
    static let chip = Font.custom("Pretendard-Medium", size: 12)
    /// 상태·단축키·제안처럼 "기계가 하는 말"은 고정폭으로 낮춘다. 한글은 시스템 고딕으로 떨어진다.
    static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }

    /// 고정폭에는 한글 글꼴이 없다. 한글이 섞이면 비례폭 고딕으로 떨어지면서 고정폭 공백만 남아
    /// 어절 사이가 벌어졌다(2026-10-27 캡처). 한글이 있으면 Pretendard, 없으면 고정폭.
    static func label(_ text: String, size: CGFloat) -> Font {
        text.unicodeScalars.contains { (0xAC00...0xD7A3).contains($0.value) || (0x3131...0x318E).contains($0.value) }
            ? .custom("Pretendard-Medium", size: size) : mono(size)
    }
}

/// 누르는 순간 반응한다. 놓을 때까지 기다리면 직접 만지는 느낌이 사라진다.
/// 스프링은 critically damped — 버튼은 튕길 이유가 없다.
struct FinePressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var scale: CGFloat = 0.97

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? scale : 1)
            .opacity(configuration.isPressed ? 0.82 : 1)
            .animation(
                reduceMotion ? .easeOut(duration: 0.12) : .spring(response: 0.3, dampingFraction: 1),
                value: configuration.isPressed
            )
    }
}

extension ButtonStyle where Self == FinePressStyle {
    static var finePress: FinePressStyle { FinePressStyle() }
}

/// 글자 크기에 따라 자간이 달라져야 한다. 큰 글자는 그대로 두면 성기게 읽히고,
/// 작은 글자는 조금 벌려야 읽힌다. 한 값을 모든 크기에 쓰면 어딘가는 틀린다.
extension View {
    func fineTracking(_ size: CGFloat) -> some View {
        tracking(size >= 20 ? -0.4 : size >= 15 ? -0.2 : size <= 11 ? 0.15 : 0)
    }
}

struct GlassSidebarBackground: View {
    /// 홈(새 탭)에서는 배경 장면이 사이드바 밑까지 번진다. 그때 사이드바는 바탕화면을 비치는
    /// 유리가 아니라, 장면 위에 바탕색을 반쯤 덮은 면이 된다 — 장면이 은은하게 비친다.
    var overArtwork = false
    /// 작업부 위에 겹쳐 뜬 사이드바. 밑이 바탕화면이 아니라 터미널이므로 바탕화면 유리는 쓸 수 없다.
    var floating = false
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast

    var body: some View {
        if #available(macOS 26, *), LiquidSidebar.isActive(reduceTransparency: reduceTransparency, contrast: contrast) {
            LiquidSidebarGlass()
        } else {
            materialSidebar
        }
    }

    private var materialSidebar: some View {
        ZStack(alignment: .trailing) {
            if floating && !overArtwork {
                // 장면이 없으면 겹친 사이드바는 불투명한 작업부 면이다.
                Rectangle().fill(FineTheme.workspace)
                Rectangle().fill(FineTheme.glassEdge).frame(width: 1)
            } else {
                desktopGlass.opacity(overArtwork ? 0 : 1)
                artworkVeil.opacity(overArtwork ? 1 : 0)
            }
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.15), value: overArtwork)
        .ignoresSafeArea()
    }

    /// 장면 위의 막. 창 안의 장면을 흐리게 받는 블러 위에 바탕색을 반쯤 덮는다 —
    /// 장면이 형체 없이 빛으로만 비치고, 사이드바 글자는 점과 다투지 않는다.
    private var artworkVeil: some View {
        let palette = FinePalette.resolve(colorScheme)
        return ZStack(alignment: .trailing) {
            // 밑에는 홈 배경이 깔아 둔 흐린 정지 화면이 있다(QuickHomeBackdrop).
            // 위아래 같은 두께 한 겹 — 위쪽 광택 그라데이션은 상단만 막혀 보이게 했다.
            // 옅은 밝기 한 겹은 장면이 끝난 아래쪽에서도 사이드바가 같은 재질로 읽히게 한다.
            // 겹쳐 뜬 사이드바도 고정 사이드바와 같은 막이다 — 밑의 터미널은 ContentView가 비운다.
            Rectangle().fill(palette.base.opacity(palette.isDark ? 0.55 : 0.6))
            Rectangle().fill(Color.white.opacity(palette.isDark ? 0.045 : 0.28))
            Rectangle().fill(FineTheme.glassEdge).frame(width: 1)
        }
    }

    @ViewBuilder
    private var desktopGlass: some View {
        // 어두운 쪽에서는 흰 광택이 뿌옇게 뜬다. 같은 구조에 세기만 낮춘다.
        let sheen = colorScheme == .dark ? 0.10 : 1.0
        ZStack(alignment: .trailing) {
            Rectangle()
                .fill(.ultraThinMaterial)

            // 밝은 쪽에서는 유리가 종이보다 밝지만, 어두운 쪽에서는 반대여야 한다.
            Rectangle().fill(FinePalette.resolve(colorScheme).sidebarTint)

            LinearGradient(
                colors: [
                    FineTheme.glassSheenTop.opacity(sheen),
                    FineTheme.glassSheenMiddle.opacity(sheen),
                    FineTheme.glassTintBottom,
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Rectangle()
                .fill(FineTheme.glassEdge)
                .frame(width: 1)
        }
        .ignoresSafeArea()
    }
}

struct QuickSectionHeader<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack {
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .tracking(0.25)
                .foregroundStyle(.secondary)
            Spacer()
            trailing
        }
        .padding(.horizontal, FineTheme.sidebarInset)
        .padding(.top, 18)
        .padding(.bottom, 5)
    }
}

// MARK: - 다크 테마

/// 밝은 종이 테마와 짙은 밤 테마가 같은 이름으로 값을 내놓는다.
/// 색을 뷰마다 하드코딩하면 테마를 하나 더 만들 때마다 전부 찾아다녀야 한다.
struct FinePalette {
    let isDark: Bool

    /// 바탕. 밝은 쪽은 종이, 어두운 쪽은 푸른 기가 도는 검정.
    let base: Color
    /// 제목 글자. 배경 위에서 충분히 떠야 한다.
    let ink: Color
    /// 컴포저 유리의 채움과 위/아래 테두리.
    let glassFill: Color
    /// 시스템 유리(macOS 26+)에 얹는 색. 유리는 뒤를 따라 밝기가 바뀌므로 글자색 쪽으로 붙잡아 둔다.
    let composerTint: Color
    let glassEdgeTop: Color
    let glassEdgeBottom: Color
    /// 작은 컨트롤의 바탕. 어두운 쪽에서는 검정이 아니라 옅은 흰색이어야 보인다.
    let controlFill: Color
    let divider: Color
    /// 컴포저 뒤에서 은은하게 올라오는 빛. 짙은 블루.
    let bloom: Color
    let shadow: Color
    /// 사이드바는 작업부보다 한 단 어두워야 한다 — 뒤로 물러나는 면이기 때문이다.
    let sidebarTint: Color
    /// 장면 위에 덮는 막. 그림이 밝으면 글자가 묻힌다.
    let sceneScrim: Color
    /// 선택된 대화 줄. 어두운 쪽에서 흰 면은 혼자 튀므로 옅은 회색으로 든다.
    let selectedFill: Color
    let selectedRim: Color

    static let light = FinePalette(
        isDark: false,
        base: Color(red: 0.965, green: 0.962, blue: 0.948),
        ink: Color(red: 0.19, green: 0.21, blue: 0.19),
        glassFill: .white.opacity(0.82),
        composerTint: .white.opacity(0.10),
        glassEdgeTop: .white.opacity(0.85),
        glassEdgeBottom: .white.opacity(0.12),
        controlFill: .black.opacity(0.05),
        divider: .black.opacity(0.07),
        bloom: .clear,
        shadow: Color(red: 0.27, green: 0.30, blue: 0.26).opacity(0.07),
        sidebarTint: .clear,
        sceneScrim: .clear,
        selectedFill: .white.opacity(0.62),
        selectedRim: .white.opacity(0.72)
    )

    /// 짙은 블루 계열. 순검정이 아니라 푸른 기를 남겨야 장면과 바탕이 한 몸으로 읽힌다.
    static let dark = FinePalette(
        isDark: true,
        base: Color(red: 0.027, green: 0.035, blue: 0.063),
        ink: Color(red: 0.90, green: 0.93, blue: 0.99),
        glassFill: Color(red: 0.055, green: 0.085, blue: 0.175).opacity(0.58),
        composerTint: Color(red: 0.03, green: 0.04, blue: 0.09).opacity(0.12),
        glassEdgeTop: .white.opacity(0.30),
        glassEdgeBottom: .white.opacity(0.04),
        controlFill: .white.opacity(0.08),
        divider: .white.opacity(0.09),
        bloom: Color(red: 0.16, green: 0.30, blue: 0.72),
        shadow: .black.opacity(0.55),
        sidebarTint: .black.opacity(0.74),
        sceneScrim: .black.opacity(0.14),
        // 거의 검은 패널 위에서는 흰 면이 조명처럼 튄다. 한 단만 들어 올린다.
        selectedFill: .white.opacity(0.10),
        selectedRim: .white.opacity(0.14)
    )

    static func resolve(_ scheme: ColorScheme) -> FinePalette {
        scheme == .dark ? .dark : .light
    }
}

private struct FinePaletteKey: EnvironmentKey {
    static let defaultValue = FinePalette.light
}

extension EnvironmentValues {
    var finePalette: FinePalette {
        get { self[FinePaletteKey.self] }
        set { self[FinePaletteKey.self] = newValue }
    }
}


// MARK: - macOS 26+ 사이드바 (11/12)

/// macOS 27의 사이드바처럼, 사이드바는 창 가장자리까지 붙은 Liquid Glass다. 그 밑에는 메인 영역의 거울
/// (`backgroundExtensionEffect`, ContentView)이 놓인다 — 홈의 장면이든 대화 탭의 터미널이든 메인에 있는 것이
/// 좌우로 뒤집혀 비친다(SEOL 11/12: "사이드패널은 메인 영역의 거울이야"). 거울 → 블러(경계로 갈수록 선명,
/// 기울기 완만, MirrorBlurTuner) → 어둡게(LiquidSidebarGlass) 순서다.
/// Reduce Transparency·Increase Contrast에서는 예전 재질 사이드바로 돌아간다.
enum LiquidSidebar {

    static func isActive(reduceTransparency: Bool, contrast: ColorSchemeContrast) -> Bool {
        guard #available(macOS 26, *) else { return false }
        return !reduceTransparency && contrast == .standard
    }
}

struct LiquidSidebarGlass: View {
    @Environment(\.colorScheme) private var colorScheme
    /// 거울의 상을 어둡게 하는 검정(다크). `defaults write com.seol.fine liquidSidebarTint -float 0.6`.
    @AppStorage("liquidSidebarTint") private var tint = 0.6

    var body: some View {
        // 사이드바 = 거울 → 블러(MirrorBlurTuner) → 어둡게(여기). 유리 효과는 쓰지 않는다: 테두리가 경계에 틈을
        // 만들고 굴절 띠가 경계 옆 글자를 조각으로 끌어왔다(11/12). 평평한 한 겹이 상을 고르게 누른다.
        Rectangle()
            .fill(colorScheme == .dark ? Color.black.opacity(tint) : Color.white.opacity(0.45))
            .ignoresSafeArea()
    }
}
