import AppKit
import QuartzCore
import SwiftUI

/// 사이드바 밑 거울(배경 확장)을 흐리고 상의 색을 낮추는 자기 블러 판. 사이드바에는 자기 색 판이 없다 — 회색·검정
/// 판을 덮으니 상의 검은 부분까지 들떠 사이드바가 제 색을 가진 판처럼 부자연스러웠다(SEOL 11/12).
///
/// 시스템 거울의 블러 레이어를 직접 고쳐 쓰지 않는다: SwiftUI가 갱신할 때마다 시스템이 제 값으로 되돌리고 우리가
/// 1초마다 다시 덮어써서, 0.1초 선명했다가 안개가 되는 깜빡임이 났다(11/12). 대신 이 판이 밑에 비친 것을 받아(백드롭)
/// 가변 블러 → 채도 → 밝기(곱)를 건다. 왼쪽 끝이 가장 흐리고 경계로 갈수록 완만하게 선명해져 `sharpEdge`배가 된다.
/// 곱이라 검정은 검정으로 남는다. 백드롭은 비공개 클래스라, 없으면 이 판은 비고 시스템 블러만 남는다.
struct MirrorBlurTuner: NSViewRepresentable {
    var radius: Double
    var sharpEdge: Double
    var saturation: Double
    var brightness: Double

    func makeNSView(context: Context) -> MirrorBlurView { MirrorBlurView() }
    func updateNSView(_ view: MirrorBlurView, context: Context) {
        view.configure(radius: radius, sharpEdge: sharpEdge, saturation: saturation, brightness: brightness)
    }
}

final class MirrorBlurView: NSView {
    private var backdrop: CALayer?
    private var settings = (radius: 0.0, sharpEdge: 0.0, saturation: 1.0, brightness: 1.0)
    private var mapWidth = 0

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        if let type = NSClassFromString("CABackdropLayer") as? CALayer.Type {
            let layer = type.init()
            layer.anchorPoint = .zero
            self.layer?.addSublayer(layer)
            backdrop = layer
        }
        setAccessibilityElement(false)
    }

    required init?(coder: NSCoder) { fatalError("not supported") }
    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    func configure(radius: Double, sharpEdge: Double, saturation: Double, brightness: Double) {
        let next = (radius, sharpEdge, saturation, brightness)
        guard next != settings else { return }
        settings = next
        mapWidth = 0
        needsLayout = true
    }

    override func layout() {
        super.layout()
        guard let backdrop else { return }
        CATransaction.begin(); CATransaction.setDisableActions(true)
        backdrop.frame = bounds
        let width = max(1, Int(bounds.width.rounded()))
        if width != mapWidth {
            mapWidth = width
            backdrop.filters = [Self.variableBlur(settings.radius, map: rampImage(width: width)),
                                settings.saturation != 1 ? Self.filter("colorSaturate", ["inputAmount": settings.saturation]) : nil,
                                settings.brightness != 1 ? Self.multiply(settings.brightness) : nil].compactMap { $0 }
        }
        CATransaction.commit()
    }

    /// 블러 세기 지도: 왼쪽 끝 1 → 오른쪽 경계 sharpEdge(완만한 직선). 가변 블러는 알파를 세기로 읽는다 — 알파 전용
    /// 회색 이미지는 만들어지지 않아(nil) 조정이 통째로 빠진 적이 있다(11/12). 늘 만들어지는 RGBA로 쓴다.
    private func rampImage(width: Int) -> CGImage? {
        var pixels = [UInt8](repeating: 0, count: width * 4)
        for x in 0..<width {
            let t = Double(x) / Double(max(1, width - 1))
            let a = UInt8((1 - t * (1 - settings.sharpEdge)) * 255)
            for c in 0..<4 { pixels[x * 4 + c] = a }
        }
        guard let provider = CGDataProvider(data: Data(pixels) as CFData) else { return nil }
        return CGImage(width: width, height: 1, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
                       space: CGColorSpaceCreateDeviceRGB(),
                       bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                       provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }

    private static func filter(_ type: String, _ values: [String: Any]) -> NSObject? {
        guard let kind = NSClassFromString("CAFilter") as? NSObject.Type else { return nil }
        let make = NSSelectorFromString("filterWithType:")
        guard kind.responds(to: make),
              let filter = kind.perform(make, with: type)?.takeUnretainedValue() as? NSObject else { return nil }
        values.forEach { filter.setValue($0.value, forKey: $0.key) }
        return filter
    }

    private static func variableBlur(_ radius: Double, map: CGImage?) -> NSObject? {
        guard let map else { return filter("gaussianBlur", ["inputRadius": radius]) }
        return filter("variableBlur", ["inputRadius": radius, "inputMaskImage": map, "inputNormalizeEdges": true])
    }

    /// 상의 색에 곱한다. 아주 약간 차갑게(파랑 쪽을 덜 낮춘다) — 음악 앱 사이드바의 푸른 기.
    private static func multiply(_ amount: Double) -> NSObject? {
        let k = max(0, min(1, amount))
        return filter("multiplyColor", ["inputColor": CGColor(srgbRed: k, green: min(1, k * 1.03), blue: min(1, k * 1.08), alpha: 1)])
    }
}
