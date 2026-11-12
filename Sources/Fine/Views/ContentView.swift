import SwiftUI

struct ContentView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Binding private var sceneWindowStateID: UUID?
    @StateObject private var appState: AppState
    @Environment(\.openWindow) private var openWindow
    @AppStorage("fineAppearance") private var appearance = FineAppearance.system.rawValue
    @AppStorage("sidebarWidth") private var sidebarWidth = Double(FineTheme.sidebarWidth)
    @AppStorage(SidebarCollapse.storageKey) private var sidebarCollapsed = false
    @State private var sidebarPeeking = false
    @State private var peekHide: DispatchWorkItem?
    /// 감상 모드(홈 배경을 눌러 UI를 숨김). 홈에서만 의미가 있다.
    @State private var immersive = false
    @State private var immersiveKeyMonitor: Any?

    private var homeUIHidden: Bool { immersive && appState.selectedSession == nil }
    @ObservedObject private var backgrounds = HomeBackgroundSettings.shared
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    /// 사이드바 거울의 블러. 터미널 탭과 새 대화(홈)에 따로 둔다 — 홈은 장면이 잘 비치게(SEOL 11/12).
    /// 왼쪽 끝 세기(pt), 경계에서 그 몇 배(작을수록 선명), 블러 뒤 채도, 블러 해상도 배율(0.25 = 애플 재질식,
    /// 넓고 고르게 퍼지는 빛). 키는 `liquidSidebar…`, 홈은 `liquidSidebarHome…`.
    @AppStorage("liquidSidebarBlur") private var mirrorBlur = 40.0
    @AppStorage("liquidSidebarSharpEdge") private var mirrorSharpEdge = 0.3
    @AppStorage("liquidSidebarSaturation") private var mirrorSaturation = 1.8
    @AppStorage("liquidSidebarHomeBlur") private var homeMirrorBlur = 48.0
    @AppStorage("liquidSidebarHomeSaturation") private var homeMirrorSaturation = 2.2
    @AppStorage("liquidSidebarBlurScale") private var mirrorBlurScale = 0.25

    /// macOS 26+: 사이드바는 창 가장자리까지 붙은 유리이고, 그 밑에는 메인 영역의 거울이 놓인다(LiquidSidebar).
    private var liquid: Bool { LiquidSidebar.isActive(reduceTransparency: reduceTransparency, contrast: contrast) }

    private var artwork: Bool {
        HomeArtworkMode.isActive(isDark: colorScheme == .dark, reduceTransparency: reduceTransparency,
                                 settings: backgrounds)
    }

    private var workspace: some View {
        ZStack {
            // 홈 배경이 장면이면 홈은 대화 탭 뒤에서도 살아 있다 — 장면이 끊기지 않고 돌고,
            // 사이드바는 전환 때 아무것도 바뀌지 않는다. 내용(인사말·입력창)만 숨는다.
            if appState.selectedSession == nil || artwork {
                QuickHomeView()
                    .environment(\.homeInBackground, appState.selectedSession != nil)
                    .transition(.opacity)
            }
            if let session = appState.selectedSession {
                AgentTerminalView(session: session)
                    .id(session.id)
                    // 접혀 있으면 신호등이 터미널 첫 줄 위에 앉는다. 그만큼 내린다.
                    .padding(.top, sidebarCollapsed ? 28 : 0)
                    // 장면 위에서는 흐린 장면 위의 검은 유리. 터미널 바탕은 비워 둔다.
                    .background(artwork ? Color.black.opacity(0.6) : FineTheme.workspace)
                    // 사이드바가 겹쳐 나와 있으면 그 밑은 비운다 — 검은 유리가 한 겹 더 깔려
                    // 고정 사이드바보다 어둡게 보였다. 밑에는 고정일 때와 같은 흐린 장면만 남는다.
                    .mask(alignment: .trailing) {
                        Rectangle().padding(.leading, artwork && sidebarCollapsed && sidebarPeeking ? sidebarWidth : 0)
                    }
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        // 유리 사이드바면 장면은 메인 영역에만 있다 — 사이드바에는 메인 영역의 거울만 놓인다.
        .environment(\.homeArtworkBleed, sidebarCollapsed || liquid ? 0 : sidebarWidth)
        // 겹쳐 나온 사이드바 밑도 장면 페이지가 흐린다.
        .environment(\.homeSidebarOverlay, sidebarCollapsed && sidebarPeeking ? sidebarWidth : 0)
        .background(FineTheme.workspace)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.15), value: appState.selectedSession?.id)
    }

    /// 펼침 고정 ↔ 접힘. 겹쳐 나온 상태에서 누르면 그 자리에 고정된다 — 사이드바는 이미
    /// 보이는 자리에 있으므로 움직이지 않고, 작업부만 비켜선다.
    private func toggleSidebar() {
        peekHide?.cancel()
        if sidebarCollapsed && sidebarPeeking {
            sidebarCollapsed = false
        } else {
            sidebarCollapsed.toggle()
        }
        sidebarPeeking = false
    }

    private func setPeeking(_ on: Bool) {
        peekHide?.cancel()
        guard sidebarPeeking != on else { return }
        sidebarPeeking = on
    }

    /// 마우스가 잠깐 비껴 나가도 바로 닫지 않는다 — 가장자리를 스치는 손은 흔하다.
    private func scheduleHidePeek() {
        peekHide?.cancel()
        let work = DispatchWorkItem { sidebarPeeking = false }
        peekHide = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: work)
    }

    init(windowStateID: Binding<UUID?> = .constant(nil)) {
        _sceneWindowStateID = windowStateID
        _appState = StateObject(wrappedValue: AppState(
            requestedWindowStateID: windowStateID.wrappedValue
        ))
    }

    var body: some View {
        // 사이드바는 하나다. 고정이면 자리를 차지하고(왼쪽 자리 비움), 접히면 왼쪽 밖으로
        // 나가고, 호버하면 같은 사이드바가 작업부 위로 들어온다. 둘을 갈아 끼우면 고정 순간에
        // 한쪽이 빠지고 한쪽이 들어오는 움직임이 보였다.
        let shown = (!sidebarCollapsed || sidebarPeeking) && !homeUIHidden
        ZStack(alignment: .topLeading) {
            if liquid {
                // 사이드바 = 메인 영역의 거울(SEOL 11/12). 메인 영역을 통째로 자기 호스팅 뷰 하나에 담고, 거기에
                // 배경 확장(macOS의 사이드바 반사)을 건다. 시스템은 그 뷰를 렌더 서버에서 좌우로 뒤집어 흐린 사본을
                // 사이드바 자리에 깐다 — 홈의 장면이든 대화 탭의 터미널이든 지금 메인에 있는 것이 그대로 비친다.
                // 이 효과는 앱의 최소 버전이 macOS 26 미만이면 포털에 위치·뒤집기가 걸리지 않아 메인 위에 사본이
                // 겹쳐 남는다(11/12 실측 — Package.swift가 26인 이유). 한 덩어리로 감싸야 웹뷰도 위아래가 맞다.
                MainAreaHost(content: AnyView(
                    workspace
                        .environment(\.homeImmersive, $immersive)
                        .environmentObject(appState)
                        .ignoresSafeArea(.container, edges: .top)
                ))
                .backgroundExtensionEffectIfAvailable(enabled: !sidebarCollapsed)
                .background { MirrorBlurTuner(radius: appState.selectedSession == nil ? homeMirrorBlur : mirrorBlur,
                                                         sharpEdge: mirrorSharpEdge,
                                                         saturation: appState.selectedSession == nil
                                                             ? homeMirrorSaturation : mirrorSaturation,
                                                         scale: mirrorBlurScale).frame(width: 0, height: 0) }
                .safeAreaInset(edge: .leading, spacing: 0) {
                    Color.clear.frame(width: sidebarCollapsed ? 0 : sidebarWidth.rounded())
                }
            } else {
                HStack(spacing: 0) {
                    Color.clear.frame(width: sidebarCollapsed ? 0 : sidebarWidth)
                    workspace
                        .environment(\.homeImmersive, $immersive)
                }
            }

            QuickSidebarView()
                .environment(\.sidebarFloating, sidebarCollapsed)
                // 정수 pt — 반 픽셀 경계는 거울과 메인 사이에 1px 줄을 남긴다.
                .frame(width: sidebarWidth.rounded())
                .frame(maxHeight: .infinity)
                // 손잡이는 레이아웃을 차지하지 않는다. 고정일 때만 폭을 바꿀 수 있다.
                .overlay(alignment: .trailing) {
                    if !sidebarCollapsed {
                        SidebarDivider(width: $sidebarWidth)
                            .offset(x: 5)
                    }
                }
                .shadow(color: .black.opacity(sidebarCollapsed && sidebarPeeking ? 0.22 : 0), radius: 18, x: 4)
                .offset(x: shown ? 0 : -(sidebarWidth + 24))
                .onHover { inside in
                    guard sidebarCollapsed else { return }
                    if inside { peekHide?.cancel() } else { scheduleHidePeek() }
                }
                .allowsHitTesting(shown)
                .accessibilityHidden(!shown)
                .zIndex(1)

            // 접힌 동안: 왼쪽 가장자리에 마우스를 대면 사이드바가 겹쳐 나온다.
            // 감상 모드: 어디를 눌러도 UI가 돌아온다.
            if homeUIHidden {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture { immersive = false }
                    .zIndex(4)
            }

            if sidebarCollapsed && !sidebarPeeking && !homeUIHidden {
                Color.clear
                    .frame(width: 6)
                    .frame(maxHeight: .infinity)
                    .contentShape(Rectangle())
                    .onHover { if $0 { setPeeking(true) } }
                    .zIndex(2)
            }

            // ⌃⌘S — macOS 사이드바 토글. 접힌 동안에도 듣도록 사이드바 밖에 둔다.
            Button("") { toggleSidebar() }
                .keyboardShortcut("s", modifiers: [.control, .command])
                .opacity(0)
                .frame(width: 0, height: 0)
                .accessibilityHidden(true)
        }
        .animation(reduceMotion ? nil : .spring(response: 0.32, dampingFraction: 1), value: sidebarCollapsed)
        .animation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 1), value: sidebarPeeking)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.35), value: homeUIHidden)
        .onChange(of: appState.selectedSession?.id) { immersive = false }
        // 키보드를 누르면 UI가 돌아온다. 그 키는 UI를 부르는 데 쓰고 흘려보내지 않는다 —
        // 입력칸이 아직 포커스를 받기 전이라 글자가 엉뚱한 곳에 떨어진다.
        .onChange(of: homeUIHidden) { _, hidden in
            if hidden {
                immersiveKeyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
                    guard immersive else { return event }
                    immersive = false
                    return nil
                }
            } else if let monitor = immersiveKeyMonitor {
                NSEvent.removeMonitor(monitor)
                immersiveKeyMonitor = nil
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: SidebarCollapse.toggle)) { note in
            if (note.object as AnyObject?) === appState { toggleSidebar() }
        }
        .background(Color.clear)
        // 외형의 출처는 하나여야 한다. preferredColorScheme는 창에 외형을 직접 박는데,
        // NSApp/창에 건 값과 어긋나면 레이아웃이 한 번 돌 때마다 서로를 덮어쓴다
        // (실측: 적용 직후 DarkAqua → 잠시 뒤 Aqua로 복귀).
        // 그래서 SwiftUI에는 맡기지 않고 AppKit 쪽 한 곳에서만 건다.
        // 뷰들의 colorScheme 환경은 창의 실제 외형을 따라오므로 결과는 같다.
        .onChange(of: appearance) { _, value in
            FineAppearance.apply(FineAppearance(rawValue: value) ?? .system)
        }
        .ignoresSafeArea(.container, edges: .top)
        .background {
            WindowBindingView(appState: appState, title: appState.windowTitle)
                .frame(width: 0, height: 0)
        }
        .environmentObject(appState)
        .focusedSceneObject(appState)
        .onAppear {
            if sceneWindowStateID == nil {
                sceneWindowStateID = appState.windowStateID
            }
            QuickConversationScanner.shared.start()
            WindowOpener.register(openWindow)
            WindowRestorer.openRemainingWindowsIfNeeded(openWindow)
        }
    }
}

/// 메인 영역을 자기 NSHostingView 하나에 담는다 — 배경 확장이 이것을 한 장의 그림으로 비추게.
private struct MainAreaHost: NSViewRepresentable {
    let content: AnyView

    func makeNSView(context: Context) -> NSHostingView<AnyView> {
        let host = NSHostingView(rootView: content)
        // 크기는 바깥 SwiftUI가 정한다. 안쪽 내용이 창 크기를 밀어내지 않게.
        host.sizingOptions = []
        return host
    }

    func updateNSView(_ host: NSHostingView<AnyView>, context: Context) {
        host.rootView = content
    }
}

private extension View {
    @ViewBuilder
    func backgroundExtensionEffectIfAvailable(enabled: Bool) -> some View {
        if #available(macOS 26, *) {
            backgroundExtensionEffect(isEnabled: enabled)
        } else {
            self
        }
    }
}
