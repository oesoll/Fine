import AppKit
import XCTest
@testable import Fine

/// 숨 쉬는 점은 Core Animation이 돌려야 한다 — SwiftUI repeatForever로 돌리면 쉬는 동안에도 메인 스레드가
/// 매 프레임 뷰를 다시 계산한다(10/31: 점 하나에 코어의 3.1%, 실제 Fine에서 16%).
final class BreathingDotTests: XCTestCase {
    @MainActor
    func testBreathingRunsAsALayerAnimation() throws {
        let view = BreathingDotView(frame: NSRect(x: 0, y: 0, width: 8, height: 8))
        view.apply(BreathingDot(color: .systemTeal, diameter: 5, glow: (1.5, 4), glowOpacity: 0.8,
                                dimOpacity: 0.55, duration: 1.1, animates: true))
        view.layout()
        let dot = try XCTUnwrap(view.layer?.sublayers?.first)
        let animation = try XCTUnwrap(dot.animation(forKey: "breathe") as? CAAnimationGroup)
        XCTAssertEqual(animation.repeatCount, .infinity)
        XCTAssertTrue(animation.autoreverses)
        XCTAssertEqual(Set(animation.animations?.compactMap { ($0 as? CABasicAnimation)?.keyPath } ?? []),
                       ["shadowRadius", "opacity"])
        XCTAssertEqual(dot.frame, CGRect(x: 1.5, y: 1.5, width: 5, height: 5))
    }

    @MainActor
    func testReducedMotionHoldsTheBrightShape() throws {
        let view = BreathingDotView(frame: NSRect(x: 0, y: 0, width: 8, height: 8))
        view.apply(BreathingDot(color: .systemTeal, diameter: 5, glow: (1.5, 4), glowOpacity: 0.8,
                                dimOpacity: 0.55, duration: 1.1, animates: false))
        let dot = try XCTUnwrap(view.layer?.sublayers?.first)
        XCTAssertNil(dot.animation(forKey: "breathe"))
        XCTAssertEqual(dot.shadowRadius, 4)
        XCTAssertEqual(dot.opacity, 1)
    }

    /// 사이드바에는 SwiftUI의 무한 반복 애니메이션이 없어야 한다.
    func testNoRepeatForeverAnimationsLeftInAlwaysVisibleViews() throws {
        let views = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Sources/Fine/Views")
        for name in ["QuickSidebarView.swift", "HomeHeadline.swift"] {
            let source = try String(contentsOf: views.appendingPathComponent(name), encoding: .utf8)
            XCTAssertFalse(source.contains("repeatForever"), "\(name) animates on the main thread every frame")
        }
    }
}
