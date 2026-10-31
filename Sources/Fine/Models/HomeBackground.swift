import AppKit
import Combine

enum HomeSceneTheme: String, CaseIterable, Identifiable {
    case light, dark
    var id: String { rawValue }
    var title: String { self == .light ? "화이트 모드" : "다크 모드" }
    var storageKey: String { "homeBackground.\(rawValue)" }
    var defaultBackground: HomeBackground { self == .light ? .forest : .photo }
}

enum ASCIIScene: String, CaseIterable, Identifiable {
    case mistyForest = "misty-forest", auroraFjord = "aurora-fjord"
    case alpineDawn = "alpine-dawn", oceanSunset = "ocean-sunset", nightCoast = "night-coast"
    case desertNight = "desert-night", lanternLake = "lantern-lake", kyotoDusk = "kyoto-dusk"
    case tokyoRain = "tokyo-rain", stormPlains = "storm-plains", deepReef = "deep-reef"
    case earthrise, marineDrive = "marine-drive", tajDawn = "taj-dawn", varanasiGhats = "varanasi-ghats"
    var id: String { rawValue }
    var title: String { rawValue.replacingOccurrences(of: "-", with: " ") }
    var sourceURL: URL { URL(string: "https://ascii.rest/\(rawValue)/")! }
    var thumbnailURL: URL? {
        Bundle.module.url(forResource: rawValue, withExtension: "png", subdirectory: "Scenes/previews")
    }
}

enum HomeBackground: String, CaseIterable, Identifiable {
    // Keep the original raw values so existing light/dark choices survive upgrades.
    case forest, aurora, alpineDawn, oceanSunset, nightCoast, desertNight, lanternLake
    case kyotoDusk, tokyoRain, stormPlains, deepReef, earthrise, marineDrive, tajDawn, varanasiGhats
    case auroraWindow, photo, plain
    var id: String { rawValue }
    var title: String {
        switch self {
        case .forest: "안개 숲"
        case .aurora: "오로라 피오르"
        case .alpineDawn: "알프스의 새벽"
        case .oceanSunset: "바다의 노을"
        case .nightCoast: "밤의 해안"
        case .desertNight: "사막의 밤"
        case .lanternLake: "등불 호수"
        case .kyotoDusk: "교토의 황혼"
        case .tokyoRain: "비 내리는 도쿄"
        case .stormPlains: "폭풍의 평원"
        case .deepReef: "깊은 바다 산호초"
        case .earthrise: "떠오르는 지구"
        case .marineDrive: "마린 드라이브"
        case .tajDawn: "타지마할의 새벽"
        case .varanasiGhats: "바라나시의 강가"
        case .auroraWindow: "작은 오로라"
        case .photo: "내 사진"
        case .plain: "단색"
        }
    }
    var scene: ASCIIScene? {
        switch self {
        case .forest: .mistyForest
        case .aurora, .auroraWindow: .auroraFjord
        case .alpineDawn: .alpineDawn
        case .oceanSunset: .oceanSunset
        case .nightCoast: .nightCoast
        case .desertNight: .desertNight
        case .lanternLake: .lanternLake
        case .kyotoDusk: .kyotoDusk
        case .tokyoRain: .tokyoRain
        case .stormPlains: .stormPlains
        case .deepReef: .deepReef
        case .earthrise: .earthrise
        case .marineDrive: .marineDrive
        case .tajDawn: .tajDawn
        case .varanasiGhats: .varanasiGhats
        case .photo, .plain: nil
        }
    }
    var isPanorama: Bool { self != .auroraWindow && self != .plain }
}

@MainActor
final class HomeBackgroundSettings: ObservableObject {
    static let shared = HomeBackgroundSettings()
    @Published private(set) var light: HomeBackground
    @Published private(set) var dark: HomeBackground
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        light = defaults.string(forKey: HomeSceneTheme.light.storageKey).flatMap(HomeBackground.init(rawValue:)) ?? .forest
        dark = defaults.string(forKey: HomeSceneTheme.dark.storageKey).flatMap(HomeBackground.init(rawValue:)) ?? .photo
    }

    func background(for theme: HomeSceneTheme) -> HomeBackground { theme == .light ? light : dark }

    func select(_ background: HomeBackground, for theme: HomeSceneTheme) {
        guard self.background(for: theme) != background else { return }
        if theme == .light { light = background } else { dark = background }
        defaults.set(background.rawValue, forKey: theme.storageKey)
        NotificationCenter.default.post(name: HomeArtworkMode.didChange, object: nil)
    }

    func cycle(_ direction: Int, for theme: HomeSceneTheme, hasPhoto: Bool) {
        let choices = HomeBackground.allCases.filter { $0 != .photo || hasPhoto }
        let current = choices.firstIndex(of: background(for: theme))
        let index = current.map { ($0 + (direction < 0 ? -1 : 1) + choices.count) % choices.count }
            ?? (direction < 0 ? choices.count - 1 : 0)
        select(choices[index], for: theme)
    }
}

/// 홈 배경이 창 전체에 깔린 장면인가. 그렇다면 대화 탭에서도 장면이 뒤에서 계속 돌고,
/// 사이드바와 터미널은 그 위의 반투명한 면이 된다.
@MainActor
enum HomeArtworkMode {
    static let didChange = Notification.Name("FineHomeArtworkModeDidChange")

    static func isActive(isDark: Bool, reduceTransparency: Bool,
                         settings: HomeBackgroundSettings? = nil) -> Bool {
        !reduceTransparency && (settings ?? .shared).background(for: isDark ? .dark : .light).isPanorama
    }

    static var isActive: Bool {
        isActive(isDark: FineAppearance.isDarkNow,
                 reduceTransparency: NSWorkspace.shared.accessibilityDisplayShouldReduceTransparency)
    }
}
