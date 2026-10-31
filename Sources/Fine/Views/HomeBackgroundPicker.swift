import SwiftUI

struct HomeBackgroundPicker: View {
    @State var theme: HomeSceneTheme
    @ObservedObject var settings: HomeBackgroundSettings
    @Binding var isPresented: Bool
    @ObservedObject private var photos = HomeSceneImageStore.shared
    @FocusState private var focusedBackground: HomeBackground?

    private let columns = 3
    private var selection: HomeBackground { settings.background(for: theme) }

    var body: some View {
        VStack(spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("배경 고르기").font(.system(size: 17, weight: .semibold))
                    Text(selection.title).font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer()
                Picker("화면 모드", selection: $theme) {
                    Text("화이트").tag(HomeSceneTheme.light)
                    Text("다크").tag(HomeSceneTheme.dark)
                }
                .pickerStyle(.segmented).labelsHidden().frame(width: 136)
            }
            ScrollViewReader { reader in
                ScrollView {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: columns), spacing: 12) {
                        ForEach(HomeBackground.allCases) { background in
                            tile(background).id(background)
                        }
                    }
                    .padding(3)
                }
                .onAppear { reader.scrollTo(selection) }
                .onChange(of: focusedBackground) { _, next in
                    if let next { reader.scrollTo(next) }
                }
                .onMoveCommand { direction in
                    let next = Self.moved(from: focusedBackground ?? selection, direction: direction, columns: columns)
                    focusedBackground = next
                    if next != .photo || photos.image(for: theme) != nil { settings.select(next, for: theme) }
                }
            }
            HStack(spacing: 12) {
                Button("사진 고르기…", systemImage: "photo.badge.plus") { choosePhoto() }
                    .buttonStyle(.plain)
                Spacer()
                Text("방향키로 미리보기 · esc 닫기")
                    .foregroundStyle(.secondary)
                Button("완료") { isPresented = false }
                    .keyboardShortcut(.defaultAction)
            }
            .font(.system(size: 11))
        }
        .padding(20)
        .frame(maxWidth: 600)
        .frame(height: 460)
        .onAppear { focusedBackground = selection }
        .onChange(of: theme) { _, next in
            // Editing another mode also shows that mode, so a selection never
            // silently changes an invisible background behind this panel.
            let appearance: FineAppearance = next == .light ? .light : .dark
            UserDefaults.standard.set(appearance.rawValue, forKey: FineAppearance.storageKey)
            FineAppearance.apply(appearance)
            focusedBackground = selection
        }
    }

    private func tile(_ background: HomeBackground) -> some View {
        let selected = selection == background
        return Button { select(background); focusedBackground = background } label: {
            VStack(alignment: .leading, spacing: 7) {
                thumbnail(background)
                    .frame(height: 76)
                    .frame(maxWidth: .infinity)
                    .clipped()
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay(alignment: .bottomTrailing) {
                        Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(selected ? Color.white : .clear)
                            .background(selected ? Color.accentColor : .clear, in: Circle())
                            .padding(6)
                    }
                Text(background.title)
                    .font(.system(size: 11, weight: selected ? .semibold : .medium))
                    .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(6)
            .background(selected ? Color.accentColor.opacity(0.08) : FineTheme.controlFill,
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder((selected || focusedBackground == background) ? Color.accentColor : .clear, lineWidth: 1.5))
            .contentShape(RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.finePress)
        .focusable()
        .focusEffectDisabled()
        .focused($focusedBackground, equals: background)
        .accessibilityLabel(background.title)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    static func moved(from current: HomeBackground, direction: MoveCommandDirection, columns: Int) -> HomeBackground {
        let choices = HomeBackground.allCases
        let index = choices.firstIndex(of: current) ?? 0
        let offset: Int
        switch direction {
        case .left: offset = -1
        case .right: offset = 1
        case .up: offset = -columns
        case .down: offset = columns
        @unknown default: offset = 0
        }
        return choices[min(choices.count - 1, max(0, index + offset))]
    }

    private func select(_ background: HomeBackground) {
        if background == .photo && photos.image(for: theme) == nil { choosePhoto() }
        else { settings.select(background, for: theme) }
    }
    private func choosePhoto() {
        if HomeSceneLibrary.chooseAndInstall(for: theme) {
            settings.select(.photo, for: theme)
            focusedBackground = .photo
        }
    }
    @ViewBuilder private func thumbnail(_ background: HomeBackground) -> some View {
        let palette: FinePalette = theme == .dark ? .dark : .light
        if let scene = background.scene, let image = HomeScenePreviews.shared.image(scene) {
            ZStack {
                palette.base
                Image(nsImage: image).resizable().aspectRatio(contentMode: .fill)
                    .padding(background == .auroraWindow ? 12 : 0)
            }
        } else if background == .photo, let image = photos.image(for: theme) {
            Image(nsImage: image).resizable().scaledToFill()
        } else {
            palette.base.overlay {
                if background == .photo { Image(systemName: "photo.badge.plus").foregroundStyle(.secondary) }
            }
        }
    }
}
