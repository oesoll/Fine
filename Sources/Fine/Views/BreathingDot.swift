import AppKit
import SwiftUI

/// 숨 쉬는 점(사이드바의 작업 중 표시, 홈 머리글의 신호 점). 움직임은 Core Animation이 돌린다.
///
/// SwiftUI의 `repeatForever` 애니메이션은 매 프레임 메인 스레드에서 뷰 그래프를 다시 계산하고 그림자를
/// 다시 칠한다. 작업 중인 탭이 하나라도 있으면 Fine이 가만히 있어도 메인 스레드가 샘플의 약 19%를
/// SwiftUI 렌더에 썼다(10/31 `sample`: NSHostingView.layout → CoreViewSetShadow). CABasicAnimation은
/// 렌더 서버가 돌리므로 앱은 쉰다. 모양과 박자는 SwiftUI 때와 같다.
struct BreathingDot: NSViewRepresentable, Equatable {
    var color: NSColor
    var diameter: CGFloat
    /// 그림자(빛 번짐) 반경: 숨을 내쉴 때 → 들이쉴 때.
    var glow: (low: CGFloat, high: CGFloat)
    var glowOpacity: Float
    /// 점 자체의 투명도: 내쉴 때(1이면 그대로).
    var dimOpacity: Float = 1
    var duration: CFTimeInterval
    /// false면 들이쉰 모양으로 멈춘다(동작 줄이기).
    var animates: Bool

    func makeNSView(context: Context) -> BreathingDotView { BreathingDotView() }

    func updateNSView(_ view: BreathingDotView, context: Context) { view.apply(self) }

    static func == (lhs: BreathingDot, rhs: BreathingDot) -> Bool {
        lhs.color == rhs.color && lhs.diameter == rhs.diameter && lhs.glow == rhs.glow
            && lhs.glowOpacity == rhs.glowOpacity && lhs.dimOpacity == rhs.dimOpacity
            && lhs.duration == rhs.duration && lhs.animates == rhs.animates
    }
}

final class BreathingDotView: NSView {
    private let dot = CALayer()
    private var spec: BreathingDot?
    private static let animationKey = "breathe"

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.masksToBounds = false
        dot.shadowOffset = .zero
        layer?.addSublayer(dot)
    }

    required init?(coder: NSCoder) { fatalError("not supported") }

    override var isFlipped: Bool { true }

    /// 장식이다 — 누르기는 아래 줄이 받는다.
    override func hitTest(_ point: NSPoint) -> NSView? { nil }

    func apply(_ spec: BreathingDot) {
        guard spec != self.spec else { return }
        self.spec = spec
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        dot.backgroundColor = spec.color.cgColor
        dot.shadowColor = spec.color.cgColor
        dot.shadowOpacity = spec.glowOpacity
        dot.cornerRadius = spec.diameter / 2
        // 멈춘 모양은 들이쉰 쪽(SwiftUI 때 동작 줄이기에서 보이던 모양).
        dot.shadowRadius = spec.glow.high
        dot.opacity = 1
        CATransaction.commit()
        needsLayout = true
        restartAnimation()
    }

    override func layout() {
        super.layout()
        guard let spec else { return }
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        dot.frame = CGRect(x: (bounds.width - spec.diameter) / 2, y: (bounds.height - spec.diameter) / 2,
                           width: spec.diameter, height: spec.diameter)
        CATransaction.commit()
    }

    /// 창에서 떨어졌다 붙으면 AppKit이 레이어 애니메이션을 지울 수 있다. 다시 건다.
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if window != nil, dot.animation(forKey: Self.animationKey) == nil { restartAnimation() }
    }

    private func restartAnimation() {
        dot.removeAnimation(forKey: Self.animationKey)
        guard let spec, spec.animates else { return }
        let radius = CABasicAnimation(keyPath: "shadowRadius")
        radius.fromValue = spec.glow.low
        radius.toValue = spec.glow.high
        let opacity = CABasicAnimation(keyPath: "opacity")
        opacity.fromValue = spec.dimOpacity
        opacity.toValue = 1
        let group = CAAnimationGroup()
        group.animations = spec.dimOpacity < 1 ? [radius, opacity] : [radius]
        group.duration = spec.duration
        group.autoreverses = true
        group.repeatCount = .infinity
        group.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        group.isRemovedOnCompletion = false
        dot.add(group, forKey: Self.animationKey)
    }
}
