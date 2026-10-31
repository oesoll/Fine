import SwiftUI

/// 입력창 아래 제안 알약 줄. 넘치면 가운데 정렬로 다음 줄로 흐른다.
struct HomeChipRow<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        WordFlow(spacing: 8, lineSpacing: 8) { content }
            .homeArtworkScheme()
    }
}

/// 고정폭 글자의 윤곽 알약. 카드와 같은 밤색을 엷게 깔아, 장면 위에서도 글자가 점과 다투지 않는다.
struct HomeChip: View {
    let text: String
    var detail: String?
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @State private var hovering = false

    var body: some View {
        let dark = colorScheme == .dark
        HStack(spacing: 8) {
            Text(text)
                .font(FineHomeFont.label(text, size: 12))
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: 220, alignment: .leading)
                .fixedSize(horizontal: true, vertical: false)
            if let detail {
                Text(detail).font(FineHomeFont.mono(11)).opacity(0.5)
            }
        }
        .foregroundStyle(.primary.opacity(hovering ? 0.95 : 0.74))
        .padding(.horizontal, 14)
        .frame(height: 30)
        .background {
            ZStack {
                if #available(macOS 26, *), !reduceTransparency {
                    // 입력창과 같은 유리, 같은 색. 알약이 카드에서 떨어져 나온 조각처럼 읽힌다.
                    Color.clear.glassEffect(.clear.tint(HomeCardStyle.glassTint(dark: dark)), in: Capsule())
                } else if !reduceTransparency {
                    Capsule().fill(.ultraThinMaterial).environment(\.colorScheme, dark ? .dark : .light)
                }
                if reduceTransparency {
                    Capsule().fill(dark ? HomeCardStyle.darkFill : .white)
                } else if #unavailable(macOS 26) {
                    Capsule().fill(dark ? HomeCardStyle.darkFill.opacity(0.62) : Color.white.opacity(0.7))
                }
                Capsule().fill(dark ? Color.white.opacity(hovering ? 0.05 : 0) : Color.black.opacity(hovering ? 0.03 : 0))
                Capsule().strokeBorder(dark ? Color.white.opacity(hovering ? 0.18 : 0.11)
                                            : Color.black.opacity(hovering ? 0.14 : 0.09), lineWidth: 1)
            }
        }
        .contentShape(Capsule())
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.14), value: hovering)
    }
}

/// 보내기 단추의 그림. 비어 있으면 윤곽만, 보낼 수 있으면 잉크로 찬다.
struct SendGlyph: View {
    let isReady: Bool
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let dark = colorScheme == .dark
        let shape = RoundedRectangle(cornerRadius: FineTheme.compactControlRadius, style: .continuous)
        let ink = dark ? Color.white.opacity(0.94) : Color.black.opacity(0.86)
        Image(systemName: "arrow.up.right")
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(isReady ? (dark ? HomeCardStyle.darkFill : .white) : Color.primary.opacity(0.55))
            .frame(width: FineTheme.compactControlHeight, height: FineTheme.compactControlHeight)
            .background(shape.fill(isReady ? ink : (dark ? Color.white.opacity(0.035) : Color.black.opacity(0.025))))
            .overlay(shape.strokeBorder(isReady ? Color.clear : (dark ? Color.white.opacity(0.13) : Color.black.opacity(0.1)),
                                        lineWidth: 1))
            .animation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 1), value: isReady)
    }
}

/// 정적인 격자. 한 번 그리고 움직이지 않는다 — 장면의 움직임과 박자를 다투지 않게.
struct HomeGrid: View {
    var spacing: CGFloat

    var body: some View {
        Canvas { context, size in
            var path = Path()
            var x: CGFloat = 0.5
            while x < size.width { path.move(to: CGPoint(x: x, y: 0)); path.addLine(to: CGPoint(x: x, y: size.height)); x += spacing }
            var y: CGFloat = 0.5
            while y < size.height { path.move(to: CGPoint(x: 0, y: y)); path.addLine(to: CGPoint(x: size.width, y: y)); y += spacing }
            context.stroke(path, with: .color(.white.opacity(0.035)), lineWidth: 1)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
