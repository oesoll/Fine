import SwiftUI

/// One live renderer survives scene changes. Static photo and theme layers fade
/// independently; no WebView is ever flattened into SwiftUI's drawingGroup.
struct QuickHomeBackdrop: View {
    var selection: HomeBackground? = nil
    var cardFrame = CGRect.zero
    /// 장면이 왼쪽으로 번진 폭. 카드 좌표(홈 영역 기준)를 이 뷰의 좌표로 옮길 때 더한다.
    var bleed: CGFloat = 0
    /// 대화 탭 뒤: 장면 전체를 흐린다.
    var blurAll = false
    /// 접힌 사이드바가 겹쳐 나온 폭 — 번짐(bleed)과 같이 그 밑을 흐린다.
    var overlay: CGFloat = 0
    /// 감상 모드로 사이드바가 빠졌다. 흐릴 띠가 없다.
    var sidebarHidden = false
    var onScenePresented: ((ASCIIScene) -> Void)? = nil
    @ObservedObject private var settings = HomeBackgroundSettings.shared
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var colorScheme
    @State private var lastScene: ASCIIScene = .mistyForest
    static let paper = FinePalette.light.base

    var body: some View {
        let theme: HomeSceneTheme = colorScheme == .dark ? .dark : .light
        let background = selection ?? settings.background(for: theme)
        let isCard = background == .auroraWindow
        let showArt = !reduceTransparency && background.scene != nil
        // 장면은 전부 검은 바탕의 점이다. 밝은 테마에서 그 아래를 종이색으로 받으면 위는 밤, 아래는
        // 크림색 — 화면이 둘로 갈렸고, 대화 탭의 검은 유리도 아래쪽에서 탁한 회색이 됐다(2026-10-27).
        // 장면이 깔린 작업부는 테마와 상관없이 밤의 바탕이다.
        let palette = HomeArtworkSurface.palette(for: background, scheme: colorScheme,
                                                 reduceTransparency: reduceTransparency)
        GeometryReader { geometry in
            // 새 대화 화면에서는 장면이 오른쪽 작업부만 덮는다 — 사이드바 밑까지 번지면 그림이 사이드바에
            // 가렸다(SEOL 11/12 "아스키의 폭이 사이드패널을 덮지 않게"). 대화 탭 뒤(흐린 장면)는 사이드바
            // 밑까지 깔아 둔다 — 유리 사이드바가 그 빛을 은은하게 비친다(SEOL이 고른 시안).
            let inset = blurAll ? 0 : bleed
            let area = CGSize(width: max(0, geometry.size.width - inset), height: geometry.size.height)
            let panorama = CGRect(x: inset, y: 0, width: area.width,
                                  height: HomeArtworkComposition.height(for: background, size: area))
            let frame = isCard && !cardFrame.isEmpty ? cardFrame.offsetBy(dx: bleed, dy: 0) : panorama
            ZStack(alignment: .topLeading) {
                palette.base
                if background == .photo && !reduceTransparency {
                    // 사진 장면은 사이드바 밑에서 따로 흐리지 않는다. 흐린 사본을 하나 더 그리면
                    // 20fps 캔버스가 둘이 된다 — 가벼움이 먼저다. 반투명 막만으로 비친다.
                    NightSceneView(reduceMotion: reduceMotion, theme: theme)
                        .blur(radius: blurAll ? 10 : 0, opaque: true)
                        .transition(.opacity)
                }
                // 사이드바 밑 띠는 장면 페이지 안에서 흐린다(scene.html #sidebar-blur). 이미 도는
                // 렌더러 하나가 안팎을 같은 박자로 움직이고, 추가 렌더러나 회색 막이 없다.
                OriginalASCIISceneView(scene: background.scene ?? lastScene,
                                       reduceMotion: reduceMotion, isActive: showArt,
                                       // 대화 탭 뒤에서는 멈춘다. 60% 검은 유리와 화면 전체 블러 밑이라 움직임은
                                       // 거의 보이지 않는데, 15fps마다 창 전체 블러를 다시 계산하느라 WebKit이
                                       // CPU 28%를 썼다(11/03 측정, 배터리). 탭을 닫으면 멈춘 자리에서 다시 돈다.
                                       isPaused: blurAll,
                                       blurBand: blurAll ? .infinity : isCard || sidebarHidden ? 0 : overlay,
                                       onPresented: onScenePresented)
                    .frame(width: frame.width, height: frame.height)
                    .background {
                        if let image = HomeScenePreviews.shared.image(background.scene ?? lastScene) {
                            Image(nsImage: image).resizable().scaledToFill()
                                .frame(width: frame.width, height: frame.height)
                        }
                    }
                    .clipped()
                    .mask {
                        if isCard { RoundedRectangle(cornerRadius: 12, style: .continuous) }
                        else { HomeSceneFade() }
                    }
                    .offset(x: frame.minX, y: frame.minY)
                    .opacity(showArt ? 1 : 0)
                    .animation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 1), value: isCard)
                if !reduceTransparency && background.isPanorama {
                    ZStack {
                        if palette.isDark { palette.sceneScrim }
                        LinearGradient(stops: HomeArtworkComposition.fade.map {
                            .init(color: palette.base.opacity($0.1), location: $0.0)
                        }, startPoint: .top, endPoint: .bottom)
                        if palette.isDark {
                            RadialGradient(colors: [.clear, .black.opacity(0.18)],
                                           center: .center, startRadius: 340, endRadius: 820)
                        }
                    }
                    .transition(.opacity)
                }
                if showArt && background.isPanorama && palette.isDark {
                    // 머리카락 굵기의 격자 한 겹. 점묘 장면이 "화면 속 그림"이 아니라 작업대의 바닥으로
                    // 읽힌다(레퍼런스 "kurage"). 장면과 같은 페이드로 아래에서 사라진다.
                    // 사이드바 밑에는 깔지 않는다(SEOL 11/12 "사이드바의 격자 디테일은 없애고").
                    let grid = CGRect(x: max(frame.minX, bleed), y: frame.minY,
                                      width: max(0, frame.maxX - max(frame.minX, bleed)), height: frame.height)
                    HomeGrid(spacing: 28)
                        .frame(width: grid.width, height: grid.height)
                        .mask { HomeSceneFade() }
                        .offset(x: grid.minX, y: grid.minY)
                        .transition(.opacity)
                }
            }
            .animation(reduceMotion ? nil : .timingCurve(0.23, 1, 0.32, 1, duration: 0.22), value: background.isPanorama)
            .animation(reduceMotion ? nil : .timingCurve(0.23, 1, 0.32, 1, duration: 0.22), value: showArt)
            .animation(reduceMotion ? nil : .timingCurve(0.23, 1, 0.32, 1, duration: 0.22), value: background == .photo)
        }
        .onChange(of: background) { _, next in if let scene = next.scene { lastScene = scene } }
        .clipped().allowsHitTesting(false).accessibilityHidden(true)
    }
}

/// 장면이 깔린 작업부의 바탕. 밝은 테마여도 파노라마 장면 위라면 밤의 팔레트를 쓴다.
enum HomeArtworkSurface {
    static func isDark(background: HomeBackground, theme: HomeSceneTheme, reduceTransparency: Bool) -> Bool {
        theme == .dark || (!reduceTransparency && background.isPanorama && background.scene != nil)
    }

    static func palette(for background: HomeBackground, scheme: ColorScheme, reduceTransparency: Bool) -> FinePalette {
        isDark(background: background, theme: scheme == .dark ? .dark : .light,
               reduceTransparency: reduceTransparency) ? .dark : .light
    }
}

private struct HomeCardFrame: PreferenceKey {
    static let defaultValue = CGRect.zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        let next = nextValue()
        if !next.isEmpty { value = next }
    }
}

struct QuickHomePresentation<Content: View>: View {
    var openTabs: [String]
    var shortcutsEnabled: Bool
    @Binding var isBackgroundPickerPresented: Bool
    @ObservedObject var backgrounds: HomeBackgroundSettings
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.homeArtworkBleed) private var bleed
    @Environment(\.homeInBackground) private var inBackground
    @Environment(\.homeSidebarOverlay) private var sidebarOverlay
    @Environment(\.homeImmersive) private var immersive
    @State private var contentFrame = CGRect.zero
    @ObservedObject private var greetings = HomeGreetingPicker.shared
    @ObservedObject private var scanner = QuickConversationScanner.shared
    let content: Content
    @State private var cardFrame = CGRect.zero
    @State private var presentedBackground: HomeBackground?

    /// 대화 탭 뒤에 있거나 감상 모드면 홈의 UI는 숨는다. 장면은 남는다.
    private var contentHidden: Bool { inBackground || immersive.wrappedValue }

    init(openTabs: [String] = [], shortcutsEnabled: Bool = true,
         isBackgroundPickerPresented: Binding<Bool> = .constant(false),
         backgrounds: HomeBackgroundSettings? = nil, @ViewBuilder content: () -> Content) {
        self.openTabs = openTabs
        self.shortcutsEnabled = shortcutsEnabled
        _isBackgroundPickerPresented = isBackgroundPickerPresented
        self.backgrounds = backgrounds ?? .shared
        self.content = content()
    }

    var body: some View {
        let palette = FinePalette.resolve(colorScheme)
        let theme: HomeSceneTheme = palette.isDark ? .dark : .light
        let background = backgrounds.background(for: theme)
        let smallScene = background == .auroraWindow && !reduceTransparency
        let contrastBackground = background.isPanorama && background.scene != nil
            ? (presentedBackground ?? background) : background
        GeometryReader { geometry in
            let inset: CGFloat = geometry.size.width < 620 ? 24 : 48
            ScrollView(.vertical) {
                VStack(spacing: smallScene ? 20 : 26) {
                    // 작은 상태 한 줄 → 큰 문장. 상태는 위에서 작게 말하고, 문장이 화면의 주인이다.
                    VStack(spacing: 14) {
                        if !greetings.note.isEmpty {
                            HomeEyebrow(text: greetings.note)
                        }
                        HomeHeadline(line: greetings.line,
                                     size: geometry.size.width < 620 ? 30 : 38,
                                     onDark: HomeArtworkSurface.isDark(background: contrastBackground, theme: theme,
                                                                       reduceTransparency: reduceTransparency))
                            .frame(maxWidth: 600)
                    }
                    .homeTextScrim()
                    .accessibilityElement(children: .combine)

                    if smallScene {
                        let width = min(720, max(240, (geometry.size.height - 420) * 2),
                                        max(0, geometry.size.width - inset * 2))
                        Color.clear
                            .frame(width: width, height: width / 2)
                            .background(GeometryReader { proxy in
                                Color.clear.preference(key: HomeCardFrame.self,
                                    value: proxy.frame(in: .named("homeArtwork")))
                            })
                            .accessibilityHidden(true)
                            .transition(.opacity)
                    }
                    content
                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .named("homeArtwork")) } action: {
                            contentFrame = $0
                        }
                }
                .frame(maxWidth: 720)
                .padding(.horizontal, inset)
                .padding(.top, smallScene ? 24 : 64)
                .padding(.bottom, smallScene ? 42 : (geometry.size.height > 620 ? 112 : 48))
                .frame(maxWidth: .infinity, minHeight: geometry.size.height)
                // 배경을 한 번 누르면 감상 모드. 입력창 언저리를 누른 손은 숨기지 않는다.
                .contentShape(Rectangle())
                .onTapGesture(coordinateSpace: .named("homeArtwork")) { location in
                    guard !contentFrame.insetBy(dx: -24, dy: -24).contains(location) else { return }
                    immersive.wrappedValue = true
                }
            }
            .scrollIndicators(.hidden)
            .disabled(isBackgroundPickerPresented)
            .accessibilityHidden(isBackgroundPickerPresented)
            // 장면은 홈 영역 왼쪽 밖, 사이드바 밑까지 번진다 — 반투명한 사이드바 너머로 비친다.
            .opacity(contentHidden ? 0 : 1)
            .offset(y: immersive.wrappedValue && !reduceMotion ? 8 : 0)
            .allowsHitTesting(!contentHidden)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.35), value: contentHidden)
            .background(QuickHomeBackdrop(selection: background, cardFrame: cardFrame, bleed: bleed,
                                          blurAll: inBackground, overlay: sidebarOverlay,
                                          sidebarHidden: immersive.wrappedValue, onScenePresented: { scene in
                guard background.scene == scene, presentedBackground != background else { return }
                presentedBackground = background
            }).padding(.leading, -bleed))
            .coordinateSpace(name: "homeArtwork")
            .environment(\.homeArtwork, HomeArtworkContext(background: contrastBackground, theme: theme,
                size: geometry.size, bleed: bleed, reducedTransparency: reduceTransparency,
                pickerOpen: isBackgroundPickerPresented))
            .animation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 1), value: smallScene)
            .onPreferenceChange(HomeCardFrame.self) { cardFrame = $0 }
        }
        .overlay(alignment: .bottomTrailing) {
            HomeBackgroundChip(background: background, showsCredit: !reduceTransparency) {
                isBackgroundPickerPresented = true
            }
            // 장면 위라면 밝은 테마에서도 바탕은 밤이다. 칩도 그 바탕을 따른다.
            .environment(\.colorScheme, HomeArtworkSurface.isDark(background: background, theme: theme,
                                                                  reduceTransparency: reduceTransparency) ? .dark : colorScheme)
            .padding(16)
            .opacity(contentHidden ? 0 : 1)
            .allowsHitTesting(!contentHidden)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.35), value: contentHidden)
        }
        .background(HomeShortcutMonitor(
            isEnabled: shortcutsEnabled && !isBackgroundPickerPresented && !contentHidden,
            onStep: { backgrounds.cycle($0, for: theme, hasPhoto: HomeSceneLibrary.sceneURL(for: theme) != nil) },
            onPresent: { isBackgroundPickerPresented = true }
        ).frame(width: 0, height: 0))
        .fineOverlay(isPresented: $isBackgroundPickerPresented) {
            HomeBackgroundPicker(theme: theme, settings: backgrounds, isPresented: $isBackgroundPickerPresented)
        }
        .onAppear { greetings.refreshIfNeeded(conversations: scanner.conversations, openTabs: openTabs) }
        .onChange(of: background) { _, next in
            if next.scene == nil || !next.isPanorama { presentedBackground = next }
        }
        .onChange(of: scanner.conversations) { _, list in
            greetings.refreshIfNeeded(conversations: list, openTabs: openTabs)
        }
    }
}

struct QuickHomeComposer<Controls: View>: View {
    @Binding var prompt: String
    /// 찾기 모드에서는 같은 입력칸이 "무엇을 찾는지"를 받는다.
    var placeholder = "무엇이든 물어보세요"
    var accessibilityName = "새 대화 메시지"
    /// 값이 바뀔 때마다 테두리가 한 번 빛나고 사라진다. 모드가 바뀐 것을 그 자리에서 알린다.
    var flash = 0
    @FocusState private var isPromptFocused: Bool
    @Environment(\.homeArtwork) private var artwork
    @Environment(\.homeInBackground) private var inBackground
    @Environment(\.homeImmersive) private var immersive
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorScheme) private var colorScheme
    let onSubmit: () -> Void
    @ViewBuilder var controls: Controls

    var body: some View {
        VStack(spacing: 0) {
            // 2026-10-27 방향 전환: 투명한 유리 위의 글자는 장면의 점과 다투다 졌다 — 자리표시자가
            // 도시 불빛에 묻혔다. 입력창은 화면에서 가장 중요한 면이므로 거의 불투명한 카드로 두고,
            // 장면은 카드 바깥에서만 산다(레퍼런스 "kurage" 홈). 글자에 번짐을 두를 필요가 없어졌다.
            TextField("", text: $prompt,
                      prompt: Text(placeholder).foregroundStyle(palette.isDark ? Color.white.opacity(0.42) : Color.black.opacity(0.38)),
                      axis: .vertical)
                .textFieldStyle(.plain)
                .font(FineHomeFont.prompt)
                .foregroundStyle(palette.isDark ? Color.white.opacity(0.94) : Color.black.opacity(0.86))
                .fineTracking(16)
                .lineSpacing(5)
                .lineLimit(2...8)
                .focused($isPromptFocused)
                .onSubmit(onSubmit)
                .accessibilityLabel(accessibilityName)
                .frame(minHeight: 52, alignment: .topLeading)
                .padding(.horizontal, 22)
                .padding(.top, 20)
                .padding(.bottom, 10)

            controls
                .padding(.horizontal, 14)
                .padding(.bottom, 14)
        }
        // 그림자는 카드 판만 드리운다. 묶음 전체에 걸면 입력칸과 컨트롤 하나하나가
        // 그림자 계산에 들어가, 화면을 한 장 찍을 때(테마 전환 물결) 0.9~1.7초가 걸렸다.
        .background {
            if usesLiquidGlass {
                liquidGlass
            } else {
                ZStack {
                    shadowCaster
                    card
                }
            }
        }
        .overlay { flashRing }
        .onAppear { isPromptFocused = true }
        .onChange(of: artwork.pickerOpen) { _, open in isPromptFocused = !open }
        // 대화 탭 뒤로 물러나거나 감상 모드로 숨으면 입력을 놓는다 — 숨은 입력칸이 키를
        // 가로채지 않게. 돌아오면 다시 입력을 받는다.
        .onChange(of: inBackground) { _, hidden in isPromptFocused = !hidden }
        .onChange(of: immersive.wrappedValue) { _, hidden in isPromptFocused = !hidden }
        .environment(\.finePalette, palette)
    }

    private var palette: FinePalette { .resolve(colorScheme) }
    static var cornerRadius: CGFloat { 20 }
    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous) }

    /// 한 번 켜졌다 꺼지는 테두리. 켜진 채로 두면 모드 표시가 아니라 경고처럼 읽힌다 —
    /// 계속 남는 표시는 "찾기 · Haiku" 알약이 맡는다.
    @ViewBuilder
    private var flashRing: some View {
        if flash > 0 {
            ZStack {
                shape.fill(FineTheme.findAccent.opacity(0.07))
                shape.strokeBorder(FineTheme.findAccent, lineWidth: 1.5)
                    .shadow(color: FineTheme.findAccent.opacity(0.55), radius: 12)
            }
            .keyframeAnimator(initialValue: 0.0, trigger: flash) { ring, glow in
                ring.opacity(glow)
            } keyframes: { _ in
                KeyframeTrack {
                    CubicKeyframe(1, duration: 0.14)
                    CubicKeyframe(1, duration: 0.22)
                    CubicKeyframe(0, duration: 0.9)
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    /// 그림자만 드리우는 판. 반투명한 카드에 그림자를 걸면 흐림 위에 흐림을 한 번 더
    /// 계산하게 된다. 같은 모양의 불투명한 판이 그림자를 맡고, 판 자체는 카드 바깥만 남긴다 —
    /// 안쪽까지 남기면 카드 너머로 판 색이 비친다.
    private var shadowCaster: some View {
        let radius: CGFloat = palette.isDark ? 40 : 24
        return shape.fill(.black)
            .shadow(color: palette.isDark ? .black.opacity(0.5) : palette.shadow, radius: radius,
                    y: palette.isDark ? 18 : 10)
            .mask {
                GeometryReader { geometry in
                    let bounds = CGRect(origin: .zero, size: geometry.size)
                    Path { path in
                        path.addRect(bounds.insetBy(dx: -radius * 3, dy: -radius * 3))
                        path.addPath(shape.path(in: bounds))
                    }
                    .fill(style: FillStyle(eoFill: true))
                }
            }
    }

    /// 거의 불투명한 밤색 카드. 뒤는 흐림으로만 비치고(형체 없는 빛), 테두리 한 올과 위쪽의
    /// 옅은 빛이 두께를 만든다. 밝은 바탕(장면 없는 종이)에서는 같은 구조의 흰 카드다.
    private var usesLiquidGlass: Bool {
        if #available(macOS 26, *) { return !reduceTransparency }
        return false
    }

    /// 시스템 유리(`.clear`) 그대로 — 가장자리의 빛과 굴절은 유리가 그린다. 바뀐 건 색 한 겹뿐이다:
    /// 어두운 쪽은 짙은 밤색, 밝은 쪽은 우윳빛으로 유리를 물들여 뒤의 점이 형체 없는 빛으로만
    /// 비친다(2026-10-27, 레퍼런스 "kurage"). 옛 엷은 색(12%)에서는 자리표시자가 도시 불빛에
    /// 묻혔고, 불투명한 카드로 바꾸자 유리가 사라졌다 — 유리는 지키고 색만 짙게 해야 했다.
    @ViewBuilder
    private var liquidGlass: some View {
        if #available(macOS 26, *) {
            Color.clear.glassEffect(.clear.tint(HomeCardStyle.glassTint(dark: palette.isDark)), in: shape)
        }
    }

    /// macOS 26 이전 또는 투명도 줄이기: 같은 색을 머티리얼 위에 깐 카드.
    @ViewBuilder
    private var card: some View {
        if reduceTransparency {
            shape.fill(palette.isDark ? HomeCardStyle.darkFill : .white)
                .overlay(shape.strokeBorder(palette.divider, lineWidth: 1))
        } else {
            ZStack {
                shape.fill(.ultraThinMaterial)
                    .environment(\.colorScheme, palette.isDark ? .dark : .light)
                shape.fill(palette.isDark ? HomeCardStyle.darkFill.opacity(0.84) : Color.white.opacity(0.9))
                if palette.isDark {
                    shape.fill(LinearGradient(colors: [.white.opacity(0.04), .clear],
                                              startPoint: .top, endPoint: .center))
                }
                shape.strokeBorder(
                    LinearGradient(colors: palette.isDark
                                   ? [.white.opacity(0.14), .white.opacity(0.06)]
                                   : [.black.opacity(0.07), .black.opacity(0.10)],
                                   startPoint: .top, endPoint: .bottom),
                    lineWidth: 1
                )
            }
        }
    }
}

/// 홈의 카드·알약이 함께 쓰는 면. 한 곳에서 정해야 카드와 제안 알약이 같은 재질로 읽힌다.
enum HomeCardStyle {
    /// 푸른 기가 남은 밤색. 순검정은 장면의 남색과 따로 논다.
    static let darkFill = Color(red: 0.035, green: 0.045, blue: 0.075)

    /// 유리에 얹는 색. 글자가 딱 읽힐 만큼만 — 더 짙으면 유리가 판이 된다.
    static func glassTint(dark: Bool) -> Color {
        dark ? darkFill.opacity(0.62) : Color.white.opacity(0.55)
    }
}

/// Prefer a single row, then move harness selection above model controls.
/// Measuring ideal widths also handles long model names without device guesses.
struct QuickHomeControls<Harness: View, Options: View, Send: View>: View {
    @ViewBuilder var harness: Harness
    @ViewBuilder var options: Options
    @ViewBuilder var send: Send

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) {
                harness
                options
                Spacer(minLength: 8)
                send
            }
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    harness
                    Spacer(minLength: 8)
                }
                HStack(spacing: 8) {
                    options
                    Spacer(minLength: 8)
                    send
                }
            }
        }
    }
}


private extension View {
    /// 조건부로 한 겹으로 합친다. `.disabled`는 상호작용만 막을 뿐 그리기에는 영향이 없다.
    @ViewBuilder
    func flattenedWhenStatic(_ flatten: Bool) -> some View {
        if flatten {
            drawingGroup(opaque: false, colorMode: .nonLinear)
        } else {
            self
        }
    }
}

/// 우하단의 배경 칩. 지금 배경의 이름을 말해 주고, 누르면 고르는 창이 열린다.
/// ascii.rest 장면이면 원작으로 가는 링크를 같은 알약 안에 붙인다 — 따로 떠 있는 고정폭 글자는
/// 화면의 다른 글자와 목소리가 달랐다.
struct HomeBackgroundChip: View {
    let background: HomeBackground
    var showsCredit = true
    let onOpen: () -> Void
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        let credit = showsCredit ? background.scene : nil
        HStack(spacing: 0) {
            Button(action: onOpen) {
                HStack(spacing: 6) {
                    Image(systemName: "photo.on.rectangle.angled")
                        .font(.system(size: 11, weight: .medium))
                    Text(background.title)
                        .font(FineHomeFont.chip)
                }
                .padding(.leading, 12)
                .padding(.trailing, credit == nil ? 12 : 9)
                .frame(height: 28)
                .contentShape(Rectangle())
            }
            .buttonStyle(.finePress)
            .help("배경 바꾸기 — ⌘← / ⌘→로 넘기고, 길게 누르면 고릅니다")
            .accessibilityLabel("홈 배경 바꾸기")
            .accessibilityValue(background.title)

            if let scene = credit {
                Rectangle()
                    .fill(.primary.opacity(0.14))
                    .frame(width: 1, height: 12)
                Link(destination: scene.sourceURL) {
                    Text("ascii.rest")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.secondary)
                        .padding(.leading, 9)
                        .padding(.trailing, 12)
                        .frame(height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.finePress)
                .help("원작 \(scene.title) — ascii.rest")
            }
        }
        .foregroundStyle(.primary.opacity(0.82))
        .background { surface }
        .fixedSize()
    }

    @ViewBuilder
    private var surface: some View {
        let palette = FinePalette.resolve(colorScheme)
        if reduceTransparency {
            Capsule().fill(palette.base)
                .overlay(Capsule().strokeBorder(palette.divider, lineWidth: 1))
        } else if #available(macOS 26, *) {
            Color.clear.glassEffect(.regular, in: Capsule())
        } else {
            Capsule().fill(.regularMaterial)
                .overlay(Capsule().strokeBorder(palette.divider, lineWidth: 1))
        }
    }
}
