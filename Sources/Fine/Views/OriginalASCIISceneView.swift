import AppKit
import SwiftUI
import WebKit

/// The original ascii.rest artwork and canvas renderer, loaded entirely from the bundle.
struct OriginalASCIISceneView: NSViewRepresentable {
    var scene: ASCIIScene = .mistyForest
    var reduceMotion: Bool
    var isActive = true
    /// 왼쪽에서부터 이 폭(pt)만큼 장면을 흐린다 — 반투명한 사이드바 밑.
    var blurBand: CGFloat = 0
    var onPresented: ((ASCIIScene) -> Void)? = nil

    func makeNSView(context: Context) -> OriginalASCIISceneNSView {
        OriginalASCIISceneNSView(frame: .zero, scene: scene)
    }

    func updateNSView(_ view: OriginalASCIISceneNSView, context: Context) {
        view.reduceMotion = reduceMotion
        view.isActive = isActive
        view.onPresented = onPresented
        view.blurBand = blurBand
        view.setScene(scene)
        view.updatePlayback()
    }

    static func dismantleNSView(_ view: OriginalASCIISceneNSView, coordinator: ()) {
        view.stop()
    }
}

final class OriginalASCIISceneNSView: NSView, WKNavigationDelegate {
    static let resourceURL = Bundle.module.url(forResource: "scene", withExtension: "html", subdirectory: "Scenes")
    let webView: WKWebView
    var reduceMotion = false
    var isActive = true
    var onPresented: ((ASCIIScene) -> Void)?
    private(set) var isReady = false
    private(set) var scene: ASCIIScene
    private var presentedScene: ASCIIScene?
    private var observers: [NSObjectProtocol] = []
    private var playing: Bool?
    var blurBand: CGFloat = 0 {
        didSet { if oldValue != blurBand { applyBlurBand() } }
    }

    init(frame: NSRect, scene: ASCIIScene = .mistyForest) {
        self.scene = scene
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        webView = WKWebView(frame: frame, configuration: configuration)
        super.init(frame: frame)
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground")
        webView.frame = bounds
        webView.autoresizingMask = [.width, .height]
        addSubview(webView)
        setAccessibilityElement(false)
        for name in [NSWindow.didChangeOcclusionStateNotification, NSWindow.didMiniaturizeNotification,
                     NSWindow.didDeminiaturizeNotification, Notification.Name.NSProcessInfoPowerStateDidChange] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.updatePlayback()
            })
        }
        if let url = Self.resourceURL {
            var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
            components.fragment = scene.rawValue
            webView.loadFileURL(components.url!, allowingReadAccessTo: url.deletingLastPathComponent())
        }
    }

    required init?(coder: NSCoder) { fatalError("not supported") }
    deinit { observers.forEach(NotificationCenter.default.removeObserver) }

    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        updatePlayback()
    }

    override func layout() {
        super.layout()
        updatePlayback()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        isReady = true
        playing = nil
        sendScene(animated: false)
        applyBlurBand()
        updatePlayback()
    }

    private func applyBlurBand() {
        guard isReady else { return }
        // 사이드바 띠는 6px, 대화 탭 뒤에서 장면 전체를 흐릴 때는 10px.
        let all = !blurBand.isFinite
        let width = all ? "100%" : "\(max(0, Int(blurBand.rounded())))px"
        let filter = all ? "blur(10px) saturate(1.2)" : "blur(6px) saturate(1.2)"
        let script = "(function (b) { b.style.width = '\(width)'; b.style.webkitBackdropFilter = '\(filter)'; b.style.backdropFilter = '\(filter)'; })(document.getElementById('sidebar-blur'))"
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    func setScene(_ next: ASCIIScene) {
        guard next != scene else {
            if isActive && presentedScene == next {
                DispatchQueue.main.async { [weak self] in
                    guard let self, self.scene == next, self.isActive else { return }
                    self.onPresented?(next)
                }
            }
            return
        }
        scene = next
        if isReady { sendScene(animated: !reduceMotion) }
    }

    private func sendScene(animated: Bool) {
        let target = scene
        webView.evaluateJavaScript("window.fineScene.setScene('\(target.rawValue)', \(animated))") { [weak self] _, error in
            guard let self, error == nil, self.scene == target else { return }
            self.presentedScene = target
            if self.isActive { self.onPresented?(target) }
        }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        isReady = false
        presentedScene = nil
        playing = nil
        webView.reload()
    }

    static func shouldAnimate(visible: Bool, reduceMotion: Bool, lowPower: Bool) -> Bool {
        visible && !reduceMotion && !lowPower
    }

    func updatePlayback() {
        guard isReady else { return }
        let visible = window.map { $0.isVisible && !$0.isMiniaturized && $0.occlusionState.contains(.visible) } ?? false
        let next = Self.shouldAnimate(visible: visible && isActive && !isHiddenOrHasHiddenAncestor,
                                      reduceMotion: reduceMotion,
                                      lowPower: ProcessInfo.processInfo.isLowPowerModeEnabled)
        guard next != playing else { return }
        playing = next
        webView.evaluateJavaScript("window.fineScene.setPlaying(\(next ? "true" : "false"))", completionHandler: nil)
    }

    func stop() {
        webView.evaluateJavaScript("window.fineScene?.setPlaying(false)", completionHandler: nil)
        webView.stopLoading()
        playing = false
    }
}
