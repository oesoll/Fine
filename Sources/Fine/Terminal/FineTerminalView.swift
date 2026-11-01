import AppKit
import GhosttyTerminal

/// 대화 탭 하나의 터미널 화면: libghostty 표면 + Fine 상태줄.
///
/// 터미널은 libghostty가 앱 프로세스 안에서 Metal로 그린다(공용 패키지 GhosttyTerminal —
/// sm과 같은 엔진). 웹뷰(xterm.js) 때는 탭마다 WebKit 프로세스가 하나씩 떴다(10/31 실측: 탭 7개에
/// 보조 프로세스 약 650MB).
///
/// 배치는 xterm 시절 terminal.html 그대로다: 카드 안쪽 여백(위 12, 좌우 16), 바닥에서 8 떨어진 높이 20의
/// 상태줄, 그리고 Claude Code의 맨 아래 힌트 줄 가리기(상태줄이 그 자리를 대신한다).
///
/// 표면(= 자식 프로세스)은 세션이 다시 띄울 때마다 새로 생기고, 이 뷰는 탭이 살아 있는 동안 그대로다 —
/// SwiftUI 호스트(TerminalHostView)는 이 뷰 하나만 붙였다 뗀다.
final class FineTerminalView: NSView {
    static let inlineInset: CGFloat = 16
    static let topInset: CGFloat = 12
    static let statusHeight: CGFloat = 20
    static let statusBottom: CGFloat = 8

    var onStatusClick: (() -> Void)? {
        get { statusRail.onClick }
        set { statusRail.onClick = newValue }
    }
    /// 표면의 자식이 끝났다.
    var onExit: (() -> Void)?
    /// 터미널 프로그램이 보낸 데스크톱 알림(OSC 9/777): 제목, 본문.
    var onNotification: ((String, String) -> Void)?

    private(set) var surface: GhosttyTerminalView?
    private let clip = FlippedView()
    private let statusRail: TerminalStatusRail
    private var palette: TerminalPalette
    private let harness: QuickHarness
    private let cropsFooterRow: Bool

    /// 마지막으로 잰 이 뷰의 크기. 화면에 한 번도 붙지 않은 뒷탭도 이 크기로 띄워, 에이전트가 처음부터
    /// 보일 폭으로 그리게 한다(xterm 때는 80×24로 떴다가 탭을 열 때 늘었다).
    private static var lastBoundsSize = NSSize(width: 900, height: 620)

    init(palette: TerminalPalette, statusText: String, harness: QuickHarness, cropsFooterRow: Bool) {
        self.palette = palette
        self.harness = harness
        self.cropsFooterRow = cropsFooterRow
        statusRail = TerminalStatusRail(text: statusText, isDark: palette.isDark)
        super.init(frame: NSRect(origin: .zero, size: Self.lastBoundsSize))
        clip.wantsLayer = true
        clip.layer?.masksToBounds = true
        addSubview(clip)
        addSubview(statusRail)
        observeAppearance()
    }

    required init?(coder: NSCoder) { fatalError("not supported") }

    override var isFlipped: Bool { true }

    // MARK: - 표면

    /// 새 표면으로 명령을 띄운다. 이전 표면이 있으면 닫는다(남은 자식은 정리한다).
    @discardableResult
    func start(_ launch: GhosttyTerminalView.Launch) -> GhosttyTerminalView {
        surface?.removeFromSuperview()
        surface?.terminate(reapingAfter: Self.terminationGrace)
        let size = bounds.width > 0 && bounds.height > 0 ? bounds.size : Self.lastBoundsSize
        let frames = Self.layout(size: size, cellHeight: Self.lastCellHeight, cropsFooterRow: cropsFooterRow)
        let view = GhosttyTerminalView(launch: launch, theme: palette.ghosttyTheme, initialSize: frames.surface.size)
        view.onCellSize = { [weak self] size in
            Self.lastCellHeight = size.height
            self?.needsLayout = true
        }
        view.onExit = { [weak self, weak view] _ in
            guard let self, view === self.surface else { return }
            self.onExit?()
        }
        view.onNotification = { [weak self] title, body in self?.onNotification?(title, body) }
        view.frame = frames.surface
        clip.addSubview(view)
        surface = view
        needsLayout = true
        return view
    }

    var failedToStart: Bool { surface?.failedToStart ?? false }
    var isProcessRunning: Bool { surface?.isProcessRunning ?? false }

    /// 앞 프로세스 그룹(셸·에이전트가 함께 있는 그룹)의 리더.
    var foregroundProcessIdentifier: pid_t? { surface?.foregroundProcessIdentifier }

    /// CLI(`fine send`·`fine keys`) 입력. 키보드로 친 바이트와 같다.
    func write(_ data: Data) -> Bool {
        guard let surface, surface.isProcessRunning else { return false }
        return surface.write(data)
    }

    /// 화면의 마지막 `lines`줄(`fine read`).
    func readScreen(lines: Int) -> String? {
        surface?.readText(lastLines: max(1, lines))
    }

    /// 표면이 지금 입고 있는 색(`fine theme`). 화면만 보고는 테마가 닿았는지 알 수 없다.
    func themeReport() -> String? {
        guard let surface else { return nil }
        let theme = surface.theme
        var report: [String: Any] = [
            "engine": "ghostty",
            "isDark": palette.isDark,
            "minimumContrastRatio": theme.minimumContrast,
        ]
        for key in ["background", "foreground", "cursor", "selectionBackground", "selectionForeground"] {
            report[key] = theme.colors[key]
        }
        guard let data = try? JSONSerialization.data(withJSONObject: report, options: [.sortedKeys]) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func focusTerminal() {
        surface?.focusTerminal()
    }

    /// 신호를 무시하는 자식(Claude Code는 SIGHUP·SIGTERM을 무시한다)에게 SIGKILL로 승격하기까지의 유예.
    static let terminationGrace: TimeInterval = 3

    /// sm 세션을 보던 표면을 뗀다: `sm-session attach`만 SIGHUP으로 끝나고 에이전트는 그대로 산다.
    /// 붙은 클라이언트는 에이전트와 다른 프로세스 그룹이라 정리(reap)할 것이 없다.
    func detach() {
        surface?.terminate()
        surface?.removeFromSuperview()
        surface = nil
    }

    /// 탭을 닫는다. `synchronously`는 앱 종료 경로 — 비동기 승격이 실행될 기회가 없다.
    func terminate(synchronously: Bool = false) {
        surface?.terminate(reapingAfter: synchronously ? 0.5 : Self.terminationGrace, synchronously: synchronously)
        surface?.removeFromSuperview()
        surface = nil
    }

    // MARK: - 배치

    /// 글꼴이 정해지기 전에 쓰는 셀 높이. 한 번 재면 다음 탭부터 그 값으로 시작한다.
    private static var lastCellHeight: CGFloat = 16

    struct Frames: Equatable {
        var clip: NSRect
        var surface: NSRect
        var status: NSRect
    }

    /// 뷰 크기에서 터미널 칸·표면·상태줄의 자리. 좌표는 위에서 아래로(isFlipped).
    ///
    /// 꼬리 줄 가리기: 보이는 칸을 셀 높이의 정수배로 자르고, 표면은 그보다 한 줄 길게 둔다 — 터미널의
    /// 마지막 줄(Claude Code의 힌트 줄)이 칸 밖에 놓여 통째로 가려진다. xterm 때는 18px을 잘라
    /// 셀 높이와 어긋나면 힌트 줄 윗부분이 비쳤다.
    static func layout(size: NSSize, cellHeight: CGFloat, cropsFooterRow: Bool) -> Frames {
        let width = max(0, size.width - inlineInset * 2)
        let areaHeight = max(0, size.height - topInset - statusHeight - statusBottom)
        let status = NSRect(x: inlineInset, y: max(0, size.height - statusBottom - statusHeight),
                            width: width, height: statusHeight)
        guard cropsFooterRow, cellHeight > 0 else {
            return Frames(clip: NSRect(x: inlineInset, y: topInset, width: width, height: areaHeight),
                          surface: NSRect(x: 0, y: 0, width: width, height: areaHeight), status: status)
        }
        let rows = (areaHeight / cellHeight + 0.001).rounded(.down)
        let clipHeight = rows * cellHeight
        // 반 포인트 여유: 표면 크기가 픽셀로 내림될 때 한 줄이 빠지지 않게.
        return Frames(clip: NSRect(x: inlineInset, y: topInset, width: width, height: clipHeight),
                      surface: NSRect(x: 0, y: 0, width: width, height: clipHeight + cellHeight + 0.5),
                      status: status)
    }

    override func layout() {
        super.layout()
        guard bounds.width > 0, bounds.height > 0 else { return }
        if window != nil { Self.lastBoundsSize = bounds.size }
        let frames = Self.layout(size: bounds.size, cellHeight: surface?.cellSize.height ?? Self.lastCellHeight,
                                 cropsFooterRow: cropsFooterRow)
        clip.frame = frames.clip
        statusRail.frame = frames.status
        if let surface, surface.frame != frames.surface { surface.frame = frames.surface }
    }

    /// 여백(상태줄 밖)을 눌러도 터미널이 키를 받는다.
    override func mouseDown(with event: NSEvent) {
        focusTerminal()
    }

    // MARK: - 외형

    /// 외형이나 홈 배경(장면↔단색)이 바뀌면 같은 하네스의 맞는 팔레트로 다시 칠한다.
    /// 터미널은 SwiftUI 밖이라 colorScheme 환경이 닿지 않는다.
    private func observeAppearance() {
        for name in [FineAppearance.didChange, HomeArtworkMode.didChange] {
            NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated {
                    guard let self else { return }
                    self.apply(.current(self.harness))
                }
            }
        }
    }

    func apply(_ palette: TerminalPalette) {
        self.palette = palette
        surface?.setTheme(palette.ghosttyTheme)
        statusRail.isDark = palette.isDark
    }
}

private final class FlippedView: NSView {
    override var isFlipped: Bool { true }
}

/// 터미널 아래의 상태줄(모델·effort). 누르면 모델 고르기가 열린다.
/// xterm 시절 terminal.html의 #fine-status와 같은 모양: 위 테두리 한 줄, SF Mono 10, 흐린 글자.
final class TerminalStatusRail: NSView {
    var onClick: (() -> Void)?
    var isDark: Bool { didSet { applyColors() } }

    private let label: NSTextField
    private var isHovered = false { didSet { applyColors() } }
    private var trackingArea: NSTrackingArea?

    init(text: String, isDark: Bool) {
        self.isDark = isDark
        label = NSTextField(labelWithString: "")
        super.init(frame: .zero)
        wantsLayer = true
        layer?.cornerRadius = 4
        label.font = .monospacedSystemFont(ofSize: 10, weight: .medium)
        label.lineBreakMode = .byTruncatingTail
        label.maximumNumberOfLines = 1
        label.cell?.truncatesLastVisibleLine = true
        label.attributedStringValue = NSAttributedString(string: text, attributes: [.kern: -0.05])
        addSubview(label)
        setAccessibilityElement(false)
        applyColors()
    }

    required init?(coder: NSCoder) { fatalError("not supported") }

    override var isFlipped: Bool { true }

    var text: String { label.stringValue }

    override func layout() {
        super.layout()
        // 테두리 1 + 글줄 19.
        let height = label.intrinsicContentSize.height
        label.frame = NSRect(x: 0, y: 1 + max(0, (19 - height) / 2), width: bounds.width, height: height)
    }

    override func draw(_ dirtyRect: NSRect) {
        borderColor.setFill()
        NSRect(x: 0, y: 0, width: bounds.width, height: 1).fill()
    }

    private var borderColor: NSColor {
        isDark ? NSColor(white: 1, alpha: 0.10) : NSColor(white: 0, alpha: 0.07)
    }

    private func applyColors() {
        let ink: CGFloat = isDark ? 1 : 0
        let textAlpha: CGFloat = isDark ? (isHovered ? 0.80 : 0.52) : (isHovered ? 0.72 : 0.48)
        label.textColor = NSColor(white: ink, alpha: textAlpha)
        layer?.backgroundColor = isHovered ? NSColor(white: ink, alpha: isDark ? 0.06 : 0.03).cgColor : nil
        needsDisplay = true
    }

    override func updateTrackingAreas() {
        if let trackingArea { removeTrackingArea(trackingArea) }
        let area = NSTrackingArea(rect: bounds, options: [.mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
                                  owner: self, userInfo: nil)
        addTrackingArea(area)
        trackingArea = area
        super.updateTrackingAreas()
    }

    override func mouseEntered(with event: NSEvent) { isHovered = true }
    override func mouseExited(with event: NSEvent) { isHovered = false }

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }

    override func mouseDown(with event: NSEvent) {}

    override func mouseUp(with event: NSEvent) {
        guard bounds.contains(convert(event.locationInWindow, from: nil)) else { return }
        onClick?()
    }
}
