import AppKit
import SwiftUI

@MainActor
final class HomeScenePreviews {
    static let shared = HomeScenePreviews()
    private var images: [ASCIIScene: NSImage] = [:]
    func image(_ scene: ASCIIScene) -> NSImage? {
        if let cached = images[scene] { return cached }
        guard let url = scene.thumbnailURL, let image = NSImage(contentsOf: url) else { return nil }
        images[scene] = image
        return image
    }
}

/// The same composition drives the view and its text contrast calculation.
enum HomeArtworkComposition {
    static let mask: [(Double, Double)] = [(0, 1), (0.60, 1), (0.80, 0.66), (0.93, 0.22), (1, 0)]
    static let fade: [(Double, Double)] = [(0, 0), (0.70, 0), (0.82, 0.32), (0.92, 0.78), (1, 1)]
    static func value(_ y: Double, in stops: [(Double, Double)]) -> Double {
        for (a, b) in zip(stops, stops.dropFirst()) where y <= b.0 {
            let fraction = min(1, max(0, (y - a.0) / (b.0 - a.0)))
            return a.1 + (b.1 - a.1) * fraction
        }
        return stops.last!.1
    }
    /// ascii.rest 장면은 2:1 격자다. 높이를 폭의 절반으로 두어야 좌우가 잘리지 않는다 —
    /// 그보다 키우면 cover 배율 때문에 양옆이 잘렸다.
    static func height(for background: HomeBackground, size: CGSize) -> CGFloat {
        background.scene == nil ? max(size.height * 0.92, 340) : size.width / 2
    }
}

struct HomeArtworkContext {
    var background: HomeBackground = .plain
    var theme: HomeSceneTheme = .light
    var size = CGSize.zero
    /// 장면이 홈 영역 왼쪽 밖으로(사이드바 밑까지) 번진 폭. 장면의 실제 폭은 size.width + bleed다.
    var bleed: CGFloat = 0
    var reducedTransparency = false
    var pickerOpen = false
}

private struct HomeArtworkContextKey: EnvironmentKey {
    static let defaultValue = HomeArtworkContext()
}
extension EnvironmentValues {
    var homeArtwork: HomeArtworkContext {
        get { self[HomeArtworkContextKey.self] }
        set { self[HomeArtworkContextKey.self] = newValue }
    }
    /// 감상 모드: 홈의 배경을 한 번 누르면 UI가 숨고 장면만 남는다. 다시 누르거나 키를 치면 돌아온다.
    var homeImmersive: Binding<Bool> {
        get { self[HomeImmersiveKey.self] }
        set { self[HomeImmersiveKey.self] = newValue }
    }
    /// 접힌 사이드바가 겹쳐 나와 있는 폭. 그 밑의 장면도 흐린다.
    var homeSidebarOverlay: CGFloat {
        get { self[HomeSidebarOverlayKey.self] }
        set { self[HomeSidebarOverlayKey.self] = newValue }
    }
    /// 이 사이드바는 작업부 위에 겹쳐 떠 있다(접힌 상태에서 호버).
    var sidebarFloating: Bool {
        get { self[SidebarFloatingKey.self] }
        set { self[SidebarFloatingKey.self] = newValue }
    }
    /// 대화 탭이 위에 떠 있어 홈은 장면만 보여 주는 중인가. 내용은 숨기고 장면 전체를 흐린다.
    var homeInBackground: Bool {
        get { self[HomeInBackgroundKey.self] }
        set { self[HomeInBackgroundKey.self] = newValue }
    }
    /// 홈의 배경 장면을 왼쪽으로 얼마나 번지게 할지 — 창이 사이드바 폭을 넘긴다.
    var homeArtworkBleed: CGFloat {
        get { self[HomeArtworkBleedKey.self] }
        set { self[HomeArtworkBleedKey.self] = newValue }
    }
}
private struct HomeImmersiveKey: EnvironmentKey {
    static let defaultValue: Binding<Bool> = .constant(false)
}
private struct HomeSidebarOverlayKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}
private struct SidebarFloatingKey: EnvironmentKey {
    static let defaultValue = false
}
/// 사이드바 접힘 상태와 토글 신호. 버튼은 사이드바 안에, 상태는 창(ContentView)에 있다.
enum SidebarCollapse {
    static let storageKey = "sidebarCollapsed"
    static let toggle = Notification.Name("FineSidebarToggle")
}
private struct HomeInBackgroundKey: EnvironmentKey {
    static let defaultValue = false
}
private struct HomeArtworkBleedKey: EnvironmentKey {
    static let defaultValue: CGFloat = 0
}

/// 장면 위 글자는 테마의 잉크 그대로 둔다. 뒤의 밝기를 재서 흰/검정으로 뒤집던 방식은
/// 한 문장 안에서 어절마다 명도가 갈렸다(2026-10-27). 읽힘은 글자 뒤에 깐 바탕색의 옅은
/// 번짐(`homeTextScrim`)이 맡는다.
private struct HomeArtworkText: ViewModifier {
    /// 강조 어절은 같은 잉크 대신 옅은 그라데이션을 쓴다.
    var accent = false
    @Environment(\.homeArtwork) private var context

    func body(content: Content) -> some View {
        let dark = HomeArtworkSurface.isDark(background: context.background, theme: context.theme,
                                             reduceTransparency: context.reducedTransparency)
        content.foregroundStyle(accent ? AnyShapeStyle(HomeAccent.headlineGradient(onDark: dark))
                                       : AnyShapeStyle(dark ? Color.white : Color.black.opacity(0.88)))
    }
}

/// 글자 묶음 뒤에 바탕색을 아주 옅게, 넓게 번지게 깐다. 글자가 딱 읽힐 만큼만 점을 가라앉히고
/// 모양은 남기지 않는다 — 상자나 띠로 보이면 장면이 끊긴다. 장면이 없으면 깔 이유가 없다.
private struct HomeTextScrim: ViewModifier {
    var strength: Double
    @Environment(\.homeArtwork) private var context

    func body(content: Content) -> some View {
        let overArt = !context.reducedTransparency && (context.background.isPanorama || context.background == .photo)
        let dark = HomeArtworkSurface.isDark(background: context.background, theme: context.theme,
                                             reduceTransparency: context.reducedTransparency)
        let base = (dark ? FinePalette.dark : FinePalette.light).base
        content.background {
            if overArt {
                Ellipse()
                    .fill(base.opacity(strength))
                    .padding(.horizontal, -48)
                    .padding(.vertical, -22)
                    .blur(radius: 30)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
    }
}

extension View {
    func homeArtworkText(accent: Bool = false) -> some View { modifier(HomeArtworkText(accent: accent)) }
    func homeTextScrim(_ strength: Double = 0.55) -> some View { modifier(HomeTextScrim(strength: strength)) }
}

/// 글자만이 아니라 표면도 바탕을 따른다. 장면 위라면 밝은 테마에서도 입력창·알약은 밤의 재질이다.
/// 안쪽 뷰는 바뀐 colorScheme으로 팔레트와 글자색을 함께 푼다.
private struct HomeArtworkScheme: ViewModifier {
    @Environment(\.homeArtwork) private var context

    func body(content: Content) -> some View {
        let dark = HomeArtworkSurface.isDark(background: context.background, theme: context.theme,
                                             reduceTransparency: context.reducedTransparency)
        content.environment(\.colorScheme, dark ? .dark : .light)
    }
}
extension View {
    func homeArtworkScheme() -> some View { modifier(HomeArtworkScheme()) }
}
