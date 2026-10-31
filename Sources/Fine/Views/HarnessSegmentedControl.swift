import SwiftUI
import AppKit

/// 하네스가 넷이 되면 세그먼트는 컴포저 줄의 절반을 먹는다. 드롭다운 하나로 접는다.
///
/// SwiftUI의 `Menu`는 `.borderlessButton` 스타일에서 라벨을 자기 방식으로 다시 그려
/// 배경과 chevron이 사라진다. 옆의 모델 버튼과 생김새가 달라지므로, 메뉴는 AppKit으로
/// 직접 띄우고 라벨은 우리가 그린 알약을 그대로 쓴다.
struct HarnessSegmentedControl: View {
    @Binding var selection: QuickHarness
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Button {
            present()
        } label: {
            FineControlPill(title: selection.title) {
                Image(selection.rawValue, bundle: .module)
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 12, height: 12)
            }
        }
        .buttonStyle(.finePress)
        .fixedSize()
        .accessibilityLabel("하네스")
        .accessibilityValue(selection.title)
        .help("대화를 실행할 하네스")
    }

    private func present() {
        let menu = NSMenu()
        for harness in QuickHarness.allCases {
            let item = NSMenuItem(
                title: harness.title,
                action: #selector(MenuTarget.pick(_:)),
                keyEquivalent: ""
            )
            item.target = MenuTarget.shared
            item.representedObject = harness.rawValue
            item.state = harness == selection ? .on : .off
            MenuTarget.shared.onPick = { selection = $0 }
            menu.addItem(item)
        }
        if let view = NSApp.keyWindow?.contentView,
           let event = NSApp.currentEvent {
            NSMenu.popUpContextMenu(menu, with: event, for: view)
        }
    }

    /// NSMenu는 Objective-C 타깃을 요구한다. 선택을 SwiftUI 바인딩으로 되돌린다.
    private final class MenuTarget: NSObject {
        static let shared = MenuTarget()
        var onPick: ((QuickHarness) -> Void)?

        @objc func pick(_ sender: NSMenuItem) {
            guard let raw = sender.representedObject as? String,
                  let harness = QuickHarness(rawValue: raw) else { return }
            onPick?(harness)
        }
    }
}

/// 컴포저 줄의 컨트롤은 전부 같은 알약이어야 한다 — 모델 버튼, 하네스 버튼, 프록시 버튼.
/// 한 곳에서 그려야 셋이 어긋나지 않는다.
struct FineControlPill<Leading: View>: View {
    let title: String
    /// 메뉴를 여는 알약은 chevron, 모드를 끄는 알약은 xmark.
    var trailingSymbol = "chevron.down"
    @ViewBuilder var leading: Leading

    var body: some View {
        HStack(spacing: 6) {
            leading
            Text(title)
                .font(.system(size: 12.5, weight: .medium))
                .fineTracking(12)
                .lineLimit(1)
            Image(systemName: trailingSymbol)
                .font(.system(size: 8, weight: .semibold))
                .foregroundStyle(.primary.opacity(0.45))
                .padding(.leading, 1)
        }
        .foregroundStyle(.primary.opacity(0.88))
        .padding(.horizontal, 11)
        .frame(height: FineTheme.compactControlHeight)
        .fineControlSurface()
        .contentShape(Rectangle())
    }
}

/// 컴포저 위 컨트롤의 바탕. 카드가 거의 불투명해진 뒤(2026-10-27)로는 장면과 다툴 일이 없다 —
/// 채움은 거의 없이 머리카락 한 올 테두리로 맺은 윤곽 알약이다. 색은 창이 아니라 이 자리의
/// 외형(`colorScheme`)으로 푼다: 밝은 테마에서도 장면 위의 카드는 어둡다.
private struct FineControlSurface: ViewModifier {
    @Environment(\.colorScheme) private var colorScheme
    @State private var hovering = false

    func body(content: Content) -> some View {
        let dark = colorScheme == .dark
        let shape = RoundedRectangle(cornerRadius: FineTheme.compactControlRadius, style: .continuous)
        content
            .background(shape.fill(dark ? Color.white.opacity(hovering ? 0.07 : 0.035)
                                        : Color.black.opacity(hovering ? 0.05 : 0.025)))
            .overlay(shape.strokeBorder(dark ? Color.white.opacity(0.11) : Color.black.opacity(0.09), lineWidth: 1))
            .onHover { hovering = $0 }
            .animation(.easeOut(duration: 0.14), value: hovering)
    }
}

/// 테두리도 채움도 없는 아이콘 단추. 덜 중요한 동작(찾기 같은)은 윤곽 알약보다 한 단 물러선다.
/// 올리면 그때만 옅은 면이 생긴다.
struct FineGhostIcon: View {
    let systemName: String
    @Environment(\.colorScheme) private var colorScheme
    @State private var hovering = false

    var body: some View {
        let dark = colorScheme == .dark
        Image(systemName: systemName)
            .font(.system(size: 13, weight: .regular))
            .foregroundStyle(.primary.opacity(hovering ? 0.9 : 0.62))
            .frame(width: FineTheme.compactControlHeight, height: FineTheme.compactControlHeight)
            .background(RoundedRectangle(cornerRadius: FineTheme.compactControlRadius, style: .continuous)
                .fill(hovering ? (dark ? Color.white.opacity(0.07) : Color.black.opacity(0.05)) : .clear))
            .contentShape(Rectangle())
            .onHover { hovering = $0 }
            .animation(.easeOut(duration: 0.14), value: hovering)
    }
}

/// 키 안내. 단축키는 고정폭의 낮은 목소리로 적는다 — 읽히되 단추처럼 보이면 안 된다.
struct FineKeyHint: View {
    let items: [(key: String, label: String)]

    var body: some View {
        HStack(spacing: 6) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                if index > 0 { Text("·").opacity(0.6) }
                Text(item.key).opacity(0.85)
                Text(item.label)
            }
        }
        .font(FineHomeFont.mono(11))
        .foregroundStyle(.primary.opacity(0.4))
        .lineLimit(1)
        .accessibilityHidden(true)
    }
}

extension View {
    func fineControlSurface() -> some View { modifier(FineControlSurface()) }
}
