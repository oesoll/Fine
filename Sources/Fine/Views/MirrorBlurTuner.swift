import AppKit
import QuartzCore
import SwiftUI

/// 사이드바 거울(배경 확장)의 블러를 다시 건다. 시스템 거울은 경계로 갈수록 덜 흐린 가변 블러를 스스로 걸어서,
/// 경계 쪽만 상이 또렷한 띠가 됐다(SEOL 11/12 "이상한 이유를 알겠다"). 음악 앱처럼 거울은 선명하게 비추고
/// 그 위에 고른 블러 하나를 건다: 효과 안의 블러 레이어(CABackdropLayer)의 가변 블러를 같은 세기의 가우시안으로
/// 바꾼다. 비공개 레이어 구조에 기대므로, 구조가 바뀌어 못 찾으면 시스템 기본 블러가 그대로 남는다.
struct MirrorBlurTuner: NSViewRepresentable {
    var radius: Double

    func makeNSView(context: Context) -> MirrorBlurTunerView { MirrorBlurTunerView() }
    func updateNSView(_ view: MirrorBlurTunerView, context: Context) {
        view.radius = radius
        view.retune()
    }
}

final class MirrorBlurTunerView: NSView {
    var radius = 12.0
    private var timer: Timer?

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        timer?.invalidate()
        guard window != nil else { return }
        // 효과의 레이어는 SwiftUI가 배치할 때 다시 만들어질 수 있다. 가볍게 몇 번 다시 건다.
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in self?.retune() }
        retune()
    }

    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    func retune() {
        guard let root = window?.contentView?.layer else { return }
        // 거울이 놓인 폭 = 효과 컨테이너(메인 영역)의 왼쪽 끝.
        var edge: CGFloat?
        Self.walk(root) { if $0.name == "BackgroundExtensionContainerLayer" { edge = $0.frame.minX } }
        var log = ""
        Self.walk(root) { layer in
            guard String(describing: type(of: layer)) == "CABackdropLayer" else { return }
            let types = (layer.filters ?? []).compactMap { ($0 as? NSObject)?.value(forKey: "type") as? String }
            // 시스템 거울의 가변 블러(창 전체 크기, 마스크로 사이드바 쪽만 흐림) 또는 이미 바꿔 둔 것.
            guard layer.name == Self.tunedName || types == ["variableBlur"] else { return }
            guard let edge, edge > 0, let filter = Self.gaussian(radius) else { return }
            CATransaction.begin(); CATransaction.setDisableActions(true)
            layer.name = Self.tunedName
            layer.filters = [filter]
            let mask = (layer.mask as? MirrorBlurMask) ?? MirrorBlurMask()
            mask.backgroundColor = NSColor.black.cgColor
            mask.frame = CGRect(x: 0, y: 0, width: edge, height: layer.bounds.height)
            layer.mask = mask
            CATransaction.commit()
            log += "tuned frame=\(layer.frame) edge=\(edge) radius=\(radius) was=\(types)\n"
        }
        if let path = ProcessInfo.processInfo.environment["FINE_DEBUG_MIRROR"] {
            try? log.write(toFile: path, atomically: true, encoding: .utf8)
        }
    }

    private static let tunedName = "FineMirrorBlur"

    private static func walk(_ layer: CALayer, _ visit: (CALayer) -> Void) {
        visit(layer)
        for sub in layer.sublayers ?? [] { walk(sub, visit) }
    }

    private static func gaussian(_ radius: Double) -> NSObject? {
        guard let type = NSClassFromString("CAFilter") as? NSObject.Type else { return nil }
        let make = NSSelectorFromString("filterWithType:")
        guard type.responds(to: make),
              let filter = type.perform(make, with: "gaussianBlur")?.takeUnretainedValue() as? NSObject else { return nil }
        filter.setValue(radius, forKey: "inputRadius")
        return filter
    }
}

/// 바꾼 블러가 걸리는 범위(사이드바 폭).
private final class MirrorBlurMask: CALayer {}
