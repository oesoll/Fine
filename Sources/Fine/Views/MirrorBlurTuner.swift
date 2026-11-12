import AppKit
import QuartzCore
import SwiftUI

/// 사이드바 거울(배경 확장)의 블러와 상의 색을 다시 건다. 사이드바에는 자기 색 판이 없다 — 회색·검정 판을 덮으니
/// 상의 검은 부분까지 들떠 사이드바가 제 색을 가진 판처럼 부자연스러웠다(SEOL 11/12). 블러 뒤에 상 자체의 채도와
/// 밝기(곱)를 낮춘다.
/// 시스템 거울은 경계 앞 몇 pt에서 급하게 선명해지는 가변 블러를
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
    /// 비친 상 자체에 곱하는 밝기(1 = 그대로). 판을 덮지 않고 상의 색을 낮춘다 — 검정은 검정으로 남는다.
    var brightness: Double

    func makeNSView(context: Context) -> MirrorBlurTunerView { MirrorBlurTunerView() }
    func updateNSView(_ view: MirrorBlurTunerView, context: Context) {
        view.radius = radius
        view.sharpEdge = sharpEdge
        view.saturation = saturation
        view.scale = scale
        view.brightness = brightness
        view.retune()
    }
}

final class MirrorBlurTunerView: NSView {
    var radius = 20.0
    var sharpEdge = 0.3
    var saturation = 1.0
    var scale = 1.0
    var brightness = 1.0
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
            layer.filters = [filter]
                + (saturation != 1 ? [Self.saturate(saturation)].compactMap { $0 } : [])
                + (brightness != 1 ? [Self.multiply(brightness)].compactMap { $0 } : [])
            if layer.responds(to: NSSelectorFromString("setScale:")) { layer.setValue(scale, forKey: "scale") }
            let clip = (layer.mask as? MirrorBlurMask) ?? MirrorBlurMask()
            clip.backgroundColor = NSColor.black.cgColor
            clip.frame = CGRect(x: 0, y: 0, width: edge, height: layer.bounds.height)
            layer.mask = clip
            CATransaction.commit()
            log += "tuned frame=\(layer.frame) edge=\(edge) radius=\(radius) was=\(types)\n"
        }
        if let path = ProcessInfo.processInfo.environment["FINE_DEBUG_MIRROR"] {
            log += "edge=\(String(describing: edge))\n"
            Self.walk(root) { l in
                let n = String(describing: type(of: l))
                guard n == "CABackdropLayer" || (l.name ?? "").contains("Extension") else { return }
                let types = (l.filters ?? []).compactMap { ($0 as? NSObject)?.value(forKey: "type") as? String }
                log += "\(n) name=\(l.name ?? "-") frame=\(l.frame) filters=\(types)\n"
            }
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
        // 가변 블러는 지도의 알파를 세기로 읽는다. 알파 전용 회색 이미지는 만들어지지 않아(nil) 조정이 통째로 빠졌다
        // (11/12) — 늘 만들어지는 RGBA(미리 곱한 알파)로 쓴다.
        var pixels = [UInt8](repeating: 0, count: w * 4)
        for x in 0..<e {
            let t = Double(x) / Double(max(1, e - 1))
            let a = UInt8((1 - t * (1 - sharpEdge)) * 255)
            pixels[x * 4] = a; pixels[x * 4 + 1] = a; pixels[x * 4 + 2] = a; pixels[x * 4 + 3] = a
        }
        guard let provider = CGDataProvider(data: Data(pixels) as CFData),
              let image = CGImage(width: w, height: 1, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: w * 4,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                                  provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
        else { return nil }
        mask = (w, e, sharpEdge, image)
        return image
    }

    /// 상의 색에 곱한다. 아주 약간 차갑게(파랑 쪽을 덜 낮춘다) — 음악 앱 사이드바의 푸른 기.
    private static func multiply(_ amount: Double) -> NSObject? {
        guard let type = NSClassFromString("CAFilter") as? NSObject.Type else { return nil }
        let make = NSSelectorFromString("filterWithType:")
        guard type.responds(to: make),
              let filter = type.perform(make, with: "multiplyColor")?.takeUnretainedValue() as? NSObject else { return nil }
        let k = max(0, min(1, amount))
        filter.setValue(CGColor(srgbRed: k, green: min(1, k * 1.03), blue: min(1, k * 1.08), alpha: 1), forKey: "inputColor")
        return filter
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
