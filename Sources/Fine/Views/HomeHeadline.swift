import SwiftUI

/// 인사말 위의 작은 한 줄. 고정폭 글자와 숨 쉬는 점 — 문장이 아니라 상태 표시로 읽힌다.
struct HomeEyebrow: View {
    let text: String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var glow = false

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(HomeAccent.signal)
                .frame(width: 6, height: 6)
                .shadow(color: HomeAccent.signal.opacity(0.9), radius: glow ? 5 : 2)
            Text(text)
                .font(FineHomeFont.label(text, size: 12))
                .tracking(0.4)
                .lineLimit(1)
                .homeArtworkText()
                .opacity(0.78)
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) { glow = true }
        }
    }
}

/// 인사말. 가는 글자에 마지막 어절만 옅은 그라데이션을 얹고, 문장이 바뀌면 어절마다 번짐에서
/// 맺히며 들어온다. 한 번 맺힌 뒤에는 움직이지 않는다 — 읽는 자리이지 장식이 아니다.
struct HomeHeadline: View {
    let line: String
    let size: CGFloat
    /// 장면 위(밤의 바탕)인가. 그라데이션의 밝기가 갈린다.
    let onDark: Bool

    var body: some View {
        // 문장이 바뀌면 새 뷰로 갈아 끼운다 — 들어오는 쪽은 어절마다 맺히고, 나가는 쪽은 번지며 빠진다.
        HeadlineWords(line: line, size: size, onDark: onDark)
            .id(line)
            .transition(.asymmetric(insertion: .identity,
                                    removal: .opacity.combined(with: .blurOut)))
            .animation(.easeOut(duration: 0.25), value: line)
    }
}

private struct HeadlineWords: View {
    let line: String
    let size: CGFloat
    let onDark: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var revealed = false

    var body: some View {
        let words = line.split(separator: " ", omittingEmptySubsequences: true).map(String.init)
        WordFlow(spacing: size * 0.24, lineSpacing: size * 0.12) {
            ForEach(Array(words.enumerated()), id: \.offset) { index, word in
                wordView(word, isLast: index == words.count - 1 && words.count > 1)
                    .blur(radius: revealed || reduceMotion ? 0 : 10)
                    .opacity(revealed ? 1 : 0)
                    .offset(y: revealed || reduceMotion ? 0 : size * 0.16)
                    .animation(reduceMotion ? .easeOut(duration: 0.2)
                               : .spring(response: 0.55, dampingFraction: 1).delay(Double(index) * 0.07),
                               value: revealed)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(line)
        .onAppear { revealed = true }
    }

    @ViewBuilder
    private func wordView(_ word: String, isLast: Bool) -> some View {
        let text = Text(word)
            .font(FineDisplayFont.greeting(size: size, isDark: onDark))
            .tracking(FineDisplayFont.greetingTracking(isDark: onDark))
        text.homeArtworkText(accent: isLast)
    }
}

/// 어절 단위로 줄을 넘기는 가운데 정렬 흐름. `Text` 하나로는 어절마다 따로 움직일 수 없다.
struct WordFlow: Layout {
    var spacing: CGFloat
    var lineSpacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = rows(width: proposal.width ?? .infinity, subviews: subviews)
        let width = rows.map(\.width).max() ?? 0
        let height = rows.map(\.height).reduce(0, +) + lineSpacing * CGFloat(max(0, rows.count - 1))
        return CGSize(width: proposal.width.map { min($0, width) } ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in rows(width: bounds.width, subviews: subviews) {
            var x = bounds.midX - row.width / 2
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y + (row.height - size.height)),
                                      proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + lineSpacing
        }
    }

    private struct Row { var indices: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func rows(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = [Row()]
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let extra = rows[rows.count - 1].indices.isEmpty ? size.width : size.width + spacing
            if rows[rows.count - 1].width + extra > width, !rows[rows.count - 1].indices.isEmpty {
                rows.append(Row())
            }
            let isFirst = rows[rows.count - 1].indices.isEmpty
            rows[rows.count - 1].indices.append(index)
            rows[rows.count - 1].width += isFirst ? size.width : size.width + spacing
            rows[rows.count - 1].height = max(rows[rows.count - 1].height, size.height)
        }
        return rows
    }
}

/// 홈의 강조색. 장면(바다·밤하늘)의 푸른 빛에서 가져와, 점 하나와 마지막 어절에만 쓴다.
enum HomeAccent {
    static let signal = Color(red: 0.42, green: 0.86, blue: 0.90)

    static func headlineGradient(onDark: Bool) -> LinearGradient {
        LinearGradient(
            colors: onDark
                ? [Color(red: 0.80, green: 0.95, blue: 0.97), Color(red: 0.76, green: 0.70, blue: 0.99)]
                : [Color(red: 0.12, green: 0.47, blue: 0.52), Color(red: 0.40, green: 0.31, blue: 0.78)],
            startPoint: .leading, endPoint: .trailing
        )
    }
}

private extension AnyTransition {
    static var blurOut: AnyTransition {
        .modifier(active: BlurModifier(radius: 8), identity: BlurModifier(radius: 0))
    }
}

private struct BlurModifier: ViewModifier {
    let radius: CGFloat
    func body(content: Content) -> some View { content.blur(radius: radius) }
}
