import AppKit
import QuartzCore
import SwiftUI

/// 사이드바 거울(배경 확장)의 블러를 다시 건다. 시스템 거울은 경계 앞 몇 pt에서 급하게 선명해지는 가변 블러를
/// 스스로 걸어서, 경계 쪽만 상이 또렷한 띠가 됐다(SEOL 11/12). 같은 가변 블러를 쓰되 기울기를 완만하게 다시 그린다:
/// 왼쪽 끝에서 가장 흐리고(radius), 오른쪽 경계로 갈수록 선명해져 경계에서는 `sharpEdge`배만 흐리다.
/// 효과 안의 블러 레이어(CABackdropLayer)는 비공개 구조라, 못 찾으면 시스템 기본 블러가 그대로 남는다.
struct MirrorBlurTuner: NSViewRepresentable {
    var radius: Double
    var sharpEdge: Double
    /// 블러 뒤 채도(1 = 그대로). 애플 재질처럼 빛이 탁해지지 않고 색이 산 채로 번지게 한다.
    var saturation: Double
    /// 블러를 이 배율의 해상도에서 계산한다(1 = 원래, 0.25 = 애플 재질). 낮을수록 넓고 고르게 퍼진다.
    var scale: Double

    func makeNSView(context: Context) -> MirrorBlurTunerView { MirrorBlurTunerView() }
    func updateNSView(_ view: MirrorBlurTunerView, context: Context) {
        view.radius = radius
        view.sharpEdge = sharpEdge
        view.saturation = saturation
        view.scale = scale
        view.retune()
    }
}

final class MirrorBlurTunerView: NSView {
    var radius = 20.0
    var sharpEdge = 0.3
    var saturation = 1.0
    var scale = 1.0
    private var mask: (width: Int, edge: Int, sharp: Double, image: CGImage)?
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
            guard let edge, edge > 0, let filter = Self.variableBlur(radius, mask: rampImage(width: layer.bounds.width, edge: edge))
            else { return }
            CATransaction.begin(); CATransaction.setDisableActions(true)
            layer.name = Self.tunedName
            layer.filters = [filter] + (saturation != 1 ? [Self.saturate(saturation)].compactMap { $0 } : [])
            if layer.responds(to: NSSelectorFromString("setScale:")) { layer.setValue(scale, forKey: "scale") }
            let clip = (layer.mask as? MirrorBlurMask) ?? MirrorBlurMask()
            clip.backgroundColor = NSColor.black.cgColor
            clip.frame = CGRect(x: 0, y: 0, width: edge, height: layer.bounds.height)
            layer.mask = clip
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

    /// 블러 세기 지도: 왼쪽 끝 1 → 경계 sharpEdge(완만한 직선), 경계 오른쪽(메인)은 0. 한 줄 높이면 된다.
    private func rampImage(width: CGFloat, edge: CGFloat) -> CGImage? {
        let w = max(1, Int(width.rounded())), e = max(1, min(w, Int(edge.rounded())))
        if let mask, mask.width == w, mask.edge == e, mask.sharp == sharpEdge { return mask.image }
        var pixels = [UInt8](repeating: 0, count: w)
        for x in 0..<e {
            let t = Double(x) / Double(max(1, e - 1))
            pixels[x] = UInt8((1 - t * (1 - sharpEdge)) * 255)
        }
        guard let provider = CGDataProvider(data: Data(pixels) as CFData),
              // 가변 블러는 지도의 알파를 세기로 읽는다(회색 이미지는 알파가 1이라 전부 최대 블러였다).
              let image = CGImage(width: w, height: 1, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: w,
                                  space: CGColorSpaceCreateDeviceGray(),
                                  bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.alphaOnly.rawValue),
                                  provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
        else { return nil }
        mask = (w, e, sharpEdge, image)
        return image
    }

    private static func saturate(_ amount: Double) -> NSObject? {
        guard let type = NSClassFromString("CAFilter") as? NSObject.Type else { return nil }
        let make = NSSelectorFromString("filterWithType:")
        guard type.responds(to: make),
              let filter = type.perform(make, with: "colorSaturate")?.takeUnretainedValue() as? NSObject else { return nil }
        filter.setValue(amount, forKey: "inputAmount")
        return filter
    }

    private static func variableBlur(_ radius: Double, mask: CGImage?) -> NSObject? {
        guard let mask, let type = NSClassFromString("CAFilter") as? NSObject.Type else { return nil }
        let make = NSSelectorFromString("filterWithType:")
        guard type.responds(to: make),
              let filter = type.perform(make, with: "variableBlur")?.takeUnretainedValue() as? NSObject else { return nil }
        filter.setValue(radius, forKey: "inputRadius")
        filter.setValue(mask, forKey: "inputMaskImage")
        filter.setValue(true, forKey: "inputNormalizeEdges")
        return filter
    }
}

/// 바꾼 블러가 걸리는 범위(사이드바 폭).
private final class MirrorBlurMask: CALayer {}
