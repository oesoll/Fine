import AppKit
import SwiftUI
import Combine

/// Measure the camera housing from macOS safe regions, in global screen points.
struct AttentionDisplayGeometry: Equatable {
    let screenFrame: CGRect
    let housing: CGRect?
    /// Concave fillet where the surface meets the bezel, so it reads as the notch growing.
    static let shoulder: CGFloat = 6

    init(frame: CGRect, safeTop: CGFloat, left: CGRect?, right: CGRect?) {
        screenFrame = frame
        if safeTop > 0, let left, let right, right.minX > left.maxX {
            housing = CGRect(x: left.maxX, y: frame.maxY - safeTop,
                             width: right.minX - left.maxX, height: safeTop)
        } else { housing = nil }
    }

    var centerX: CGFloat { housing?.midX ?? screenFrame.midX }
    var topY: CGFloat { housing?.maxY ?? screenFrame.maxY - 6 }
    /// Hit area of the resting dot, a hair's gap left of the housing.
    var badgeFrame: CGRect {
        if let housing {
            return CGRect(x: housing.minX - 6 - 22, y: housing.midY - 11, width: 22, height: 22)
        }
        return CGRect(x: screenFrame.midX - 11, y: screenFrame.maxY - 28, width: 22, height: 22)
    }
    var hoverFrame: CGRect {
        // Observe the hardware region without creating a window over it.
        housing ?? badgeFrame
    }
    /// Wings of ~56pt either side of the housing: room for a status mark and a count.
    var contentWidth: CGFloat { max((housing?.width ?? 52) + 112, 288) }
    /// At rest the surface is the hardware notch itself, so opening grows out of it
    /// and closing is absorbed back into it.
    var restingSize: CGSize { housing?.size ?? CGSize(width: 52, height: 22) }

    /// `size` is the body; the window adds the shoulders on both sides.
    func frame(size: CGSize) -> CGRect {
        let width = size.width + 2 * Self.shoulder
        return CGRect(x: centerX - width / 2, y: topY - size.height, width: width, height: size.height)
    }

    /// A cursor pushed against the top of the screen sits exactly on `maxY`, which
    /// `CGRect.contains` excludes; treat that row as inside, but not a display above.
    func reaches(_ point: CGPoint, _ rect: CGRect, slack: CGFloat = 4) -> Bool {
        let zone = rect.insetBy(dx: -slack, dy: -slack)
        return point.x >= zone.minX && point.x <= zone.maxX
            && point.y >= zone.minY && point.y <= min(zone.maxY, screenFrame.maxY)
    }
}

private final class AttentionPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

/// One fixed-width surface, revealed downward by a mask. The hosting view keeps
/// its full layout even during the compact preview, so text never scales/reflows.
private final class AttentionPopoverSurface: NSView {
    override var isFlipped: Bool { true }
    private let host: NSHostingView<AttentionNotchView>
    private let silhouette = CAShapeLayer()
    private let contentMask = CAShapeLayer()
    private var target: (size: CGSize, radius: CGFloat)?
    private var shown = false
    private var finish: DispatchWorkItem?

    init(controller: AttentionNotch) {
        host = NSHostingView(rootView: AttentionNotchView(controller: controller, store: controller.store))
        super.init(frame: .zero)
        wantsLayer = true
        silhouette.fillColor = NSColor.black.cgColor
        layer?.addSublayer(silhouette)
        host.wantsLayer = true
        addSubview(host)
        host.layer?.mask = contentMask
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    /// Every state shares one element structure so Core Animation can morph between them.
    private func outline(size: CGSize, radius: CGFloat, offset: CGFloat = 0) -> CGPath {
        let s = AttentionDisplayGeometry.shoulder
        let rect = CGRect(x: (bounds.width - size.width) / 2 + offset, y: 0, width: size.width, height: size.height)
        // Slightly longer than the radius with flattened handles: a continuous corner.
        let corner = min(radius * 1.25, (rect.height - s) / 2, rect.width / 2)
        let handle = corner * 0.22
        let path = CGMutablePath()
        path.move(to: CGPoint(x: rect.minX - s, y: 0))
        path.addQuadCurve(to: CGPoint(x: rect.minX, y: s), control: CGPoint(x: rect.minX, y: 0))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY - corner))
        path.addCurve(to: CGPoint(x: rect.minX + corner, y: rect.maxY),
                      control1: CGPoint(x: rect.minX, y: rect.maxY - handle),
                      control2: CGPoint(x: rect.minX + handle, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.maxX - corner, y: rect.maxY))
        path.addCurve(to: CGPoint(x: rect.maxX, y: rect.maxY - corner),
                      control1: CGPoint(x: rect.maxX - handle, y: rect.maxY),
                      control2: CGPoint(x: rect.maxX, y: rect.maxY - handle))
        path.addLine(to: CGPoint(x: rect.maxX, y: s))
        path.addQuadCurve(to: CGPoint(x: rect.maxX + s, y: 0), control: CGPoint(x: rect.maxX, y: 0))
        path.closeSubpath()
        return path
    }

    func update(size: CGSize, radius: CGFloat, resting: CGSize, contentSize: CGSize, visible: Bool, animated: Bool,
                completion: @escaping () -> Void) {
        finish?.cancel()
        let previous = target ?? (size: resting, radius: AttentionNotch.restingRadius)
        let changed = previous.size != size || previous.radius != radius || shown != visible
        let opening = visible && (!shown || size.height > previous.size.height)
        host.frame = CGRect(x: (bounds.width - contentSize.width) / 2, y: 0, width: contentSize.width, height: contentSize.height)
        // Start from what is on screen, not from the last target, so an interrupted move continues.
        let from = silhouette.animation(forKey: "shape") != nil ? silhouette.presentation()?.path
            : outline(size: shown ? previous.size : resting, radius: shown ? previous.radius : AttentionNotch.restingRadius)
        var shift = CGAffineTransform(translationX: -host.frame.minX, y: 0)
        let maskFrom = from?.copy(using: &shift)
        let path = outline(size: size, radius: radius)
        let maskPath = outline(size: size, radius: radius, offset: -host.frame.minX)
        let contentOpacity = host.layer?.presentation()?.opacity ?? (shown ? 1 : 0)
        let surfaceOpacity = silhouette.presentation()?.opacity ?? (shown ? 1 : 0)
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        silhouette.frame = bounds; silhouette.path = path
        silhouette.opacity = visible ? 1 : 0
        contentMask.frame = host.bounds; contentMask.path = maskPath
        host.layer?.opacity = visible ? 1 : 0
        CATransaction.commit()
        var settle: TimeInterval = 0
        if changed && animated {
            // Arrival carries a trace of bounce, like the hardware island; leaving never does.
            for (layer, source, destination) in [(silhouette, from, path), (contentMask, maskFrom, maskPath)] {
                let shape = CASpringAnimation(perceptualDuration: opening ? 0.4 : 0.3, bounce: opening ? 0.12 : 0)
                shape.keyPath = "path"
                shape.fromValue = source; shape.toValue = destination
                shape.duration = shape.settlingDuration
                settle = max(settle, shape.duration)
                layer.add(shape, forKey: "shape")
            }
            if shown != visible {
                let now = CACurrentMediaTime()
                let out = CAMediaTimingFunction(controlPoints: 0.23, 1, 0.32, 1)
                // Opening: the black arrives at once (it starts as the notch), the words follow.
                // Closing: the words leave first, the black melts into the notch at the end.
                let fades: [(CALayer?, Float, CFTimeInterval, CFTimeInterval)] = visible
                    ? [(silhouette, surfaceOpacity, 0, 0.08), (host.layer, contentOpacity, 0.06, 0.2)]
                    : [(host.layer, contentOpacity, 0, 0.1), (silhouette, surfaceOpacity, 0.16, 0.12)]
                for (target, from, delay, duration) in fades {
                    let fade = CABasicAnimation(keyPath: "opacity")
                    fade.fromValue = from; fade.toValue = visible ? 1 : 0
                    fade.beginTime = now + delay; fade.fillMode = .backwards
                    fade.duration = duration; fade.timingFunction = out
                    target?.add(fade, forKey: "reveal")
                    settle = max(settle, delay + duration)
                }
            }
        } else if !animated {
            silhouette.removeAllAnimations(); contentMask.removeAllAnimations(); host.layer?.removeAllAnimations()
        }
        target = (size, radius); shown = visible
        let work = DispatchWorkItem(block: completion)
        finish = work
        if settle > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + settle, execute: work) }
        else { work.perform() }
    }

    var presentation: [String: Any] {
        let rect = silhouette.presentation()?.path?.boundingBoxOfPath ?? .zero
        return ["opacity": host.layer?.presentation()?.opacity ?? host.layer?.opacity ?? 0,
                "width": rect.width, "height": rect.height,
                "animating": silhouette.animation(forKey: "shape") != nil]
    }
}

@MainActor
final class AttentionNotch: ObservableObject {
    static let shared = AttentionNotch(store: .shared)
    enum Mode: String { case hidden, peek, details }
    /// Close to the hardware notch's lower corners, so the resting shape disappears into it.
    static let restingRadius: CGFloat = 9
    @Published private(set) var mode = Mode.hidden
    @Published private(set) var contentMode = Mode.details
    @Published private(set) var housingWidth: CGFloat = 179
    @Published private(set) var housingHeight: CGFloat = 32
    @Published private(set) var contentWidth: CGFloat = 291
    var expanded: Bool { mode != .hidden }
    @Published private(set) var errorMessage: String?
    @Published private(set) var previewID: String?
    let store: AttentionStore
    private var panel: AttentionPanel?
    private var badge: AttentionPanel?
    private var surface: AttentionPopoverSurface?
    private var geometry: AttentionDisplayGeometry?
    private var subscription: AnyCancellable?
    private var screenObserver: NSObjectProtocol?
    private var outsideClick: Any?
    private var localClick: Any?
    private var globalPointer: Any?
    private var localPointer: Any?
    private var hoverWork: DispatchWorkItem?
    private var hoverRegion = 0 // outside / housing / popover
    private var openedByHover = false
    private var collapse: DispatchWorkItem?
    private var opening = false
    private var generation = 0
    // Isolated E2E drives the control socket; real desktop input must not close
    // its fixture while the user continues working in other applications.
    private let observesDesktopInput = ProcessInfo.processInfo.environment["FINE_ATTENTION_TEST_MODE"] != "1"

    init(store: AttentionStore) { self.store = store }

    var displayItems: [AttentionItem] {
        let items = store.ordered
        guard let first = items.first(where: { $0.id == previewID }) else { return items }
        return [first] + items.filter { $0.id != first.id }
    }
    var attentionItems: [AttentionItem] { displayItems.filter { $0.state.needsAttention } }

    struct Group: Identifiable {
        let id: String
        let name: String
        let host: String
        let items: [AttentionItem]
    }
    /// One tmux session is one workspace. Groups keep the order their most urgent
    /// item has in `displayItems`, so the previewed notification stays on top;
    /// inside a group, questions come before quiet work.
    var groups: [Group] {
        var order: [String] = []
        var members: [String: [AttentionItem]] = [:]
        for item in displayItems {
            let id = item.host + "\u{1F}" + item.group
            if members[id] == nil { order.append(id) }
            members[id, default: []].append(item)
        }
        return order.map { id in
            let items = members[id]!
            return Group(id: id, name: items[0].group, host: items[0].host,
                         items: items.filter { $0.state.needsAttention } + items.filter { !$0.state.needsAttention })
        }
    }

    // MARK: Layout metrics — the view draws with these, the window is sized by them.

    enum Metrics {
        static let inset: CGFloat = 6        // list edge to row highlight
        static let padding: CGFloat = 10     // row highlight to text
        static let indent: CGFloat = 13      // status dot + gap, so messages align with titles
        static let titleHeight: CGFloat = 17
        static let lineHeight: CGFloat = 16
        static let quietRow: CGFloat = 28
        static let listTop: CGFloat = 2
        static let listBottom: CGFloat = 8
        static let groupHeader: CGFloat = 22
        static let groupGap: CGFloat = 6
        static let maxList: CGFloat = 380
        static let messageFont = NSFont.systemFont(ofSize: 12)
    }

    func messageLines(_ item: AttentionItem) -> Int {
        let width = contentWidth - 2 * (Metrics.inset + Metrics.padding) - Metrics.indent
        let height = (item.displayMessage as NSString).boundingRect(
            with: CGSize(width: width, height: 1000), options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: [.font: Metrics.messageFont]).height
        let line = NSLayoutManager().defaultLineHeight(for: Metrics.messageFont)
        return min(2, max(1, Int((height / line - 0.2).rounded(.up))))
    }
    func rowHeight(_ item: AttentionItem) -> CGFloat {
        guard item.state.needsAttention else { return Metrics.quietRow }
        return 9 + Metrics.titleHeight + 3 + CGFloat(messageLines(item)) * Metrics.lineHeight + 9
    }
    var listHeight: CGFloat {
        let groups = groups
        return Metrics.listTop + groups.reduce(0) { total, group in
            total + Metrics.groupHeader + group.items.reduce(0) { $0 + rowHeight($1) }
        } + CGFloat(max(0, groups.count - 1)) * Metrics.groupGap + Metrics.listBottom
    }
    var detailHeight: CGFloat {
        housingHeight + (store.items.isEmpty ? 44 : min(listHeight, Metrics.maxList))
            + (errorMessage == nil ? 0 : 40)
    }
    var peekHeight: CGFloat {
        housingHeight + Metrics.listTop + Metrics.groupHeader
            + (groups.first?.items.first.map(rowHeight) ?? 0) + Metrics.listBottom
    }

    func start() {
        guard subscription == nil else { return }
        store.onAttention = { [weak self] in self?.reveal(automatic: true) }
        subscription = store.$items.receive(on: DispatchQueue.main).sink { [weak self] _ in self?.layout() }
        screenObserver = NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification,
                                                               object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.layout(animated: false) }
        }
        store.start()
        layout(animated: false)
        guard observesDesktopInput else { return }
        // Mouse movement is event-driven. No polling timer and no invisible
        // full-width window intercepting menu-bar or desktop clicks at rest.
        globalPointer = NSEvent.addGlobalMonitorForEvents(matching: .mouseMoved) { [weak self] _ in
            MainActor.assumeIsolated { self?.pointerMoved(to: NSEvent.mouseLocation) }
        }
        localPointer = NSEvent.addLocalMonitorForEvents(matching: .mouseMoved) { [weak self] event in
            MainActor.assumeIsolated { self?.pointerMoved(to: NSEvent.mouseLocation) }
            return event
        }
    }

    private func pointerMoved(to point: CGPoint) {
        guard let geometry else { return }
        let overSurface = expanded && ((panel.map { geometry.reaches(point, $0.frame, slack: 0) } ?? false)
            || geometry.reaches(point, geometry.badgeFrame, slack: 0))
        // The resting dot is part of the notch: hovering it opens the list too.
        let overDot = (badge?.isVisible ?? false) && geometry.reaches(point, geometry.badgeFrame, slack: 2)
        let region = geometry.reaches(point, geometry.hoverFrame) || overDot ? 1 : overSurface ? 2 : 0
        guard region != hoverRegion else { return }
        hoverRegion = region
        hoverWork?.cancel()
        if (region == 1 && mode != .details) || (region == 2 && mode == .peek) {
            // Just long enough to ignore a cursor crossing the notch on its way to a menu.
            let work = DispatchWorkItem { [weak self] in
                guard let self, self.hoverRegion != 0, self.mode != .details else { return }
                self.reveal(automatic: true, detail: true)
                self.collapse?.cancel()
                self.openedByHover = true
            }
            hoverWork = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.06, execute: work)
        } else if region != 0 {
            collapse?.cancel()
        } else if expanded && openedByHover {
            // Allow the pointer to briefly leave the edge while moving into the list.
            let work = DispatchWorkItem { [weak self] in
                guard let self, self.hoverRegion == 0, self.openedByHover else { return }
                self.hide()
            }
            hoverWork = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3, execute: work)
        }
    }

    func reveal(automatic: Bool = false, animated: Bool = true, detail: Bool = false) {
        // An arriving event must not shrink the list the user is reading.
        if automatic && !detail && mode == .details { layout(); return }
        collapse?.cancel()
        hoverWork?.cancel()
        openedByHover = false
        errorMessage = nil
        if automatic && !detail {
            previewID = store.items.filter { $0.state.needsAttention }.max { $0.updatedAt < $1.updatedAt }?.id
        }
        mode = automatic && !detail ? .peek : .details
        contentMode = mode
        layout(animated: animated)
        if !automatic { panel?.makeKeyAndOrderFront(nil) }
        if automatic && !detail {
            let work = DispatchWorkItem { [weak self] in self?.hide() }
            collapse = work
            DispatchQueue.main.asyncAfter(deadline: .now() + 6, execute: work)
        }
    }

    func hide(animated: Bool = true) {
        collapse?.cancel()
        hoverWork?.cancel()
        openedByHover = false
        mode = .hidden
        layout(animated: animated)
    }

    func toggle() { if expanded { hide() } else { reveal() } }

    func dismiss(_ item: AttentionItem) {
        do {
            try store.dismiss(id: item.id)
            if previewID == item.id { previewID = nil }
            if store.items.isEmpty { hide() }
        } catch { errorMessage = "알림을 지우지 못했습니다." }
    }

    func open(_ item: AttentionItem) {
        guard !opening, !item.source.isEmpty else { return }
        opening = true
        Task {
            do {
                try await AttentionRouter.open(item)
                // Opening a question does not resolve it. A new event or × does.
                mode = .hidden
                errorMessage = nil
            } catch { errorMessage = "세션을 열지 못했습니다. 이미 종료되었거나 연결이 끊겼을 수 있습니다." }
            opening = false
            layout()
        }
    }

    private func makePanel(title: String) -> AttentionPanel {
        let window = AttentionPanel(contentRect: .zero, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        window.isOpaque = false; window.backgroundColor = .clear; window.hasShadow = false
        window.level = .statusBar
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        window.isReleasedWhenClosed = false; window.hidesOnDeactivate = false
        window.acceptsMouseMovedEvents = true
        window.title = title
        return window
    }

    func layout(animated: Bool = true) {
        if mode == .peek && store.waitingCount == 0 {
            mode = .hidden
            collapse?.cancel()
        }
        guard let screen = NSScreen.screens.first(where: { $0.safeAreaInsets.top > 0 }) ?? NSScreen.main else { return }
        let display = AttentionDisplayGeometry(frame: screen.frame, safeTop: screen.safeAreaInsets.top,
                                              left: screen.auxiliaryTopLeftArea, right: screen.auxiliaryTopRightArea)
        let changedDisplay = geometry != display
        geometry = display
        housingWidth = display.housing?.width ?? 52
        housingHeight = display.housing?.height ?? 22
        contentWidth = display.contentWidth
        if badge == nil {
            let window = makePanel(title: "Fine 알림 표시")
            window.contentView = NSHostingView(rootView: AttentionBadgeView(controller: self, store: store))
            badge = window
        }
        badge?.setFrame(display.badgeFrame, display: true)
        // No idle decoration, no extra black silhouette over the physical notch.
        // Left alone while it stays, so an update does not make the dot blink.
        if expanded || store.waitingCount == 0 { badge?.orderOut(nil) }
        if panel == nil {
            let window = makePanel(title: "Fine 에이전트 알림")
            let view = AttentionPopoverSurface(controller: self)
            window.contentView = view
            surface = view; panel = window
        }
        guard let panel, let surface else { return }
        let size: CGSize, radius: CGFloat
        switch mode {
        case .hidden: size = display.restingSize; radius = Self.restingRadius
        case .peek: size = CGSize(width: display.contentWidth, height: peekHeight); radius = 20
        case .details: size = CGSize(width: display.contentWidth, height: detailHeight); radius = 24
        }
        let shouldAnimate = animated && !changedDisplay && (expanded || panel.isVisible)
            && !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        generation += 1
        let currentGeneration = generation
        // Hold the larger of the current and target bodies until the motion settles.
        let current = CGSize(width: panel.frame.width - 2 * AttentionDisplayGeometry.shoulder, height: panel.frame.height)
        let canvas = shouldAnimate ? CGSize(width: max(current.width, size.width), height: max(current.height, size.height)) : size
        panel.setFrame(display.frame(size: canvas), display: true)
        if expanded { panel.orderFrontRegardless() }
        let contentSize = CGSize(width: display.contentWidth, height: detailHeight)
        surface.update(size: size, radius: radius, resting: display.restingSize, contentSize: contentSize,
                       visible: expanded, animated: shouldAnimate) { [weak self] in
            guard let self, self.generation == currentGeneration else { return }
            if !self.expanded {
                panel.orderOut(nil)
                if self.store.waitingCount > 0, let badge = self.badge, !badge.isVisible {
                    badge.alphaValue = 0
                    badge.orderFrontRegardless()
                    NSAnimationContext.runAnimationGroup { context in
                        context.duration = 0.2
                        context.timingFunction = CAMediaTimingFunction(controlPoints: 0.23, 1, 0.32, 1)
                        badge.animator().alphaValue = 1
                    }
                }
            }
            panel.setFrame(display.frame(size: size), display: true)
            if canvas != size {
                surface.update(size: size, radius: radius, resting: display.restingSize, contentSize: contentSize,
                               visible: self.expanded, animated: false) {}
            }
        }
        updateOutsideClickMonitors()
    }

    private func updateOutsideClickMonitors() {
        guard observesDesktopInput else { return }
        if expanded && outsideClick == nil {
            outsideClick = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
                MainActor.assumeIsolated { self?.hide() }
            }
            localClick = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] event in
                MainActor.assumeIsolated {
                    if let self, event.window !== self.panel && event.window !== self.badge { self.hide() }
                }
                return event
            }
        } else if !expanded {
            if let outsideClick { NSEvent.removeMonitor(outsideClick) }
            if let localClick { NSEvent.removeMonitor(localClick) }
            outsideClick = nil; localClick = nil
        }
    }

    var status: [String: Any] {
        func frame(_ window: NSWindow?) -> [String: CGFloat] {
            window.map { ["x": $0.frame.minX, "y": $0.frame.minY, "width": $0.frame.width, "height": $0.frame.height] } ?? [:]
        }
        var result: [String: Any] = ["visible": (panel?.isVisible ?? false) || (badge?.isVisible ?? false),
            "expanded": expanded, "mode": mode.rawValue, "waiting": store.waitingCount, "working": store.workingCount,
            "frame": frame(expanded ? panel : badge), "badgeFrame": frame(badge),
            "badgeVisible": badge?.isVisible ?? false, "panelVisible": panel?.isVisible ?? false,
            "presentation": surface?.presentation ?? [:],
            "hoverRegion": hoverRegion, "openedByHover": openedByHover,
            "leadingID": displayItems.first?.id ?? "", "itemCount": store.items.count]
        if let geometry {
            result["display"] = ["hasNotch": geometry.housing != nil, "width": geometry.housing?.width ?? 0,
                                 "height": geometry.housing?.height ?? 0, "centerX": geometry.centerX,
                                 "topY": geometry.topY,
                                 "source": geometry.housing == nil ? "top-center fallback" : "NSScreen safe regions"]
        }
        return result
    }

    func snapshot(to path: String, compact: Bool = false) throws {
        guard let panel else { throw AttentionError("no display available") }
        let content = compact
            ? AnyView(AttentionBadgeView(controller: self, store: store).frame(width: 22, height: 22))
            : AnyView(AttentionNotchView(controller: self, store: store, snapshot: true)
                .frame(width: contentWidth, height: detailHeight, alignment: .top)
                .frame(width: contentWidth, height: panel.frame.height, alignment: .top).clipped().background(.black)
                .clipShape(UnevenRoundedRectangle(bottomLeadingRadius: 24, bottomTrailingRadius: 24, style: .continuous))
                .padding(.horizontal, AttentionDisplayGeometry.shoulder))
        let renderer = ImageRenderer(content: content)
        renderer.scale = panel.backingScaleFactor
        guard let cgImage = renderer.cgImage else { throw AttentionError("could not render notifications") }
        let rep = NSBitmapImageRep(cgImage: cgImage)
        guard let data = rep.representation(using: .png, properties: [:]) else { throw AttentionError("could not encode notifications") }
        try data.write(to: URL(fileURLWithPath: path), options: .atomic)
    }
}

private extension AttentionState {
    /// Soft, desaturated tints: legible on pure black without shouting.
    var tint: Color {
        switch self {
        case .error: return Color(red: 1, green: 0.45, blue: 0.42)
        case .blocked: return Color(red: 1, green: 0.62, blue: 0.32)
        case .waiting: return Color(red: 1, green: 0.80, blue: 0.38)
        case .working: return Color(red: 0.52, green: 0.70, blue: 1)
        case .done: return Color(red: 0.46, green: 0.84, blue: 0.56)
        case .unknown: return Color.white.opacity(0.32)
        }
    }
}

private extension AttentionItem {
    var displayMessage: String { message.isEmpty ? state.label : message }
    private var titleParts: [String] { title.components(separatedBy: " · ") }
    /// Hooks title items "project · harness"; the project is what the eye looks for.
    var project: String { titleParts.first ?? title }
    /// The host lives on the group header; the row only names the harness.
    var meta: String { titleParts.dropFirst().joined(separator: " · ") }
}

/// At rest the notch keeps one small light: the colour of the most urgent agent.
private struct AttentionBadgeView: View {
    @ObservedObject var controller: AttentionNotch
    @ObservedObject var store: AttentionStore

    var body: some View {
        let state = store.ordered.first { $0.state.needsAttention }?.state
        let tint = state?.tint ?? .white.opacity(0.4)
        Button { controller.toggle() } label: {
            Circle().fill(tint).frame(width: 8, height: 8)
                .shadow(color: tint.opacity(0.65), radius: 3)
                // Keeps the edge on a light menu bar, invisible on a dark one.
                .overlay(Circle().strokeBorder(.black.opacity(0.22), lineWidth: 0.5))
                .frame(width: 22, height: 22).contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle())
        .animation(.easeOut(duration: 0.2), value: state)
        .accessibilityLabel("답변이 필요한 에이전트 \(store.waitingCount)개. \(controller.expanded ? "접기" : "열기")")
        .help("답변이 필요한 에이전트 \(store.waitingCount)개")
    }
}

private struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

private struct AttentionNotchView: View {
    @ObservedObject var controller: AttentionNotch
    @ObservedObject var store: AttentionStore
    var snapshot = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            header
            if store.items.isEmpty {
                Text("조용합니다. 기다리는 에이전트가 없어요.")
                    .font(.system(size: 12)).foregroundStyle(.white.opacity(0.45))
                    .frame(maxWidth: .infinity, alignment: .center).frame(height: 36)
            } else if snapshot {
                // ImageRenderer does not materialize scroll content.
                list.frame(maxHeight: .infinity, alignment: .top)
            } else {
                ScrollViewReader { proxy in
                    ScrollView { list }
                        .scrollIndicators(.hidden)
                        .scrollDisabled(controller.mode != .details)
                        .onChange(of: controller.mode) { previous, current in
                            if current == .peek || (previous == .hidden && current == .details),
                               let first = controller.displayItems.first {
                                proxy.scrollTo(first.id, anchor: .top)
                            }
                        }
                }
            }
            if let message = controller.errorMessage {
                Text(message).font(.system(size: 11)).foregroundStyle(AttentionState.error.tint)
                    .lineLimit(2).frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16).frame(height: 40)
            }
        }
        .foregroundStyle(.white)
        .onExitCommand { controller.hide(animated: false) }
        .preferredColorScheme(.dark)
    }

    /// The wings either side of the camera: what is most urgent on the left, how many on the right.
    private var header: some View {
        let lead = store.ordered.first
        return Button { controller.hide() } label: {
            HStack(spacing: 0) {
                Circle().fill(lead?.state.tint ?? .white.opacity(0.3)).frame(width: 7, height: 7)
                    .shadow(color: (lead?.state.tint ?? .clear).opacity(0.7), radius: 4)
                    .frame(maxWidth: .infinity)
                Color.clear.frame(width: controller.housingWidth)
                Text(store.waitingCount > 0 ? "\(store.waitingCount)" : "")
                    .font(.system(size: 13, weight: .semibold, design: .rounded)).monospacedDigit()
                    .contentTransition(.numericText())
                    .frame(maxWidth: .infinity)
            }
            .frame(height: controller.housingHeight).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("답변이 필요한 에이전트 \(store.waitingCount)개. 접기")
    }

    private var list: some View {
        let groups = controller.groups
        // Running position across groups, for the stagger.
        let starts = groups.indices.map { index in
            groups[..<index].reduce(0) { $0 + 1 + $1.items.count }
        }
        return VStack(spacing: AttentionNotch.Metrics.groupGap) {
            ForEach(Array(groups.enumerated()), id: \.element.id) { position, group in
                VStack(spacing: 0) {
                    groupHeader(group).modifier(reveal(starts[position]))
                    ForEach(Array(group.items.enumerated()), id: \.element.id) { index, item in
                        row(item).id(item.id).modifier(reveal(starts[position] + 1 + index))
                    }
                }
            }
        }
        .padding(.horizontal, AttentionNotch.Metrics.inset)
        .padding(.top, AttentionNotch.Metrics.listTop).padding(.bottom, AttentionNotch.Metrics.listBottom)
    }

    private func groupHeader(_ group: AttentionNotch.Group) -> some View {
        HStack(spacing: 5) {
            Text(group.name).font(.system(size: 11, weight: .semibold)).foregroundStyle(.white.opacity(0.5))
            if group.name != group.host {
                Text(group.host).font(.system(size: 11)).foregroundStyle(.white.opacity(0.28))
            }
            Spacer(minLength: 0)
        }
        .lineLimit(1)
        .padding(.horizontal, AttentionNotch.Metrics.padding)
        .frame(height: AttentionNotch.Metrics.groupHeader, alignment: .bottom)
        .accessibilityAddTraits(.isHeader)
        .accessibilityLabel(group.name == group.host ? group.name : "\(group.name), \(group.host)")
    }

    /// The first group's header and row are already there in the compact state;
    /// the rest settle in behind them.
    private func reveal(_ index: Int) -> StaggeredReveal {
        StaggeredReveal(shown: index <= 1 || controller.contentMode == .details,
                        delay: 0.03 + Double(min(index, 6)) * 0.03, reduceMotion: reduceMotion)
    }

    private func row(_ item: AttentionItem) -> some View {
        AttentionRow(item: item, lines: controller.messageLines(item), height: controller.rowHeight(item),
                     interactive: controller.mode == .details,
                     open: { controller.open(item) }, dismiss: { controller.dismiss(item) })
    }
}

private struct StaggeredReveal: ViewModifier {
    let shown: Bool
    let delay: Double
    let reduceMotion: Bool

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown || reduceMotion ? 0 : -6)
            .animation(shown ? .spring(duration: 0.34, bounce: 0).delay(reduceMotion ? 0 : delay)
                             : .easeOut(duration: 0.1), value: shown)
    }
}

private struct AttentionRow: View {
    let item: AttentionItem
    let lines: Int
    let height: CGFloat
    let interactive: Bool
    let open: () -> Void
    let dismiss: () -> Void
    @State private var hovering = false

    private var quiet: Bool { !item.state.needsAttention }
    private typealias M = AttentionNotch.Metrics

    var body: some View {
        Button(action: open) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 7) {
                    Circle().fill(item.state.tint).frame(width: 6, height: 6)
                    Text(item.project)
                        .font(.system(size: quiet ? 12 : 13, weight: quiet ? .medium : .semibold))
                        .foregroundStyle(.white.opacity(quiet ? 0.7 : 0.95)).lineLimit(1)
                    Spacer(minLength: 8)
                    Text(item.meta).font(.system(size: 11)).foregroundStyle(.white.opacity(0.36)).lineLimit(1)
                        .opacity(hovering ? 0 : 1)
                }
                .frame(height: M.titleHeight)
                if !quiet {
                    Text(item.displayMessage)
                        .font(.system(size: 12)).foregroundStyle(.white.opacity(0.62))
                        .lineLimit(lines).lineSpacing(1)
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                        .frame(height: CGFloat(lines) * M.lineHeight, alignment: .topLeading)
                        .padding(.leading, M.indent)
                }
            }
            .padding(.horizontal, M.padding)
            .frame(height: height)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(.white.opacity(hovering && !item.source.isEmpty ? 0.07 : 0)))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle())
        .help(item.message)
        .accessibilityLabel("\(item.project), \(item.state.label), \(item.displayMessage)")
        .accessibilityHint(item.source.isEmpty ? "" : "발신 세션 열기")
        .overlay(alignment: .topTrailing) {
            Button(action: dismiss) {
                Image(systemName: "xmark").font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.white.opacity(0.55))
                    .frame(width: 20, height: 20)
                    .background(Circle().fill(.white.opacity(0.1)))
                    .contentShape(Circle())
            }
            .buttonStyle(PressableStyle())
            .padding(.top, quiet ? 4 : 7.5).padding(.trailing, 7)
            .opacity(hovering ? 1 : 0)
            .allowsHitTesting(hovering)
            .accessibilityLabel("\(item.project) 알림 지우기")
        }
        .onHover { hovering = interactive && $0 }
        .onChange(of: interactive) { if !$1 { hovering = false } }
        .animation(.easeOut(duration: 0.12), value: hovering)
    }
}
