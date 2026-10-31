import AppKit
import Foundation

/// User artwork stays outside the bundle and repository. The legacy dark file
/// remains in place, so existing Overdose artwork is preserved on upgrade.
enum HomeSceneLibrary {
    static let didChange = Notification.Name("FineHomeSceneDidChange")
    static var directory: URL { FinePaths.home.appendingPathComponent(".fine", isDirectory: true) }
    static let extensions = ["png", "jpg", "jpeg", "heic", "webp"]

    static func filenames(for theme: HomeSceneTheme) -> [String] {
        extensions.map { "\(theme == .dark ? "home-scene" : "home-scene-light").\($0)" }
    }

    static func sceneURL(for theme: HomeSceneTheme, in folder: URL = directory) -> URL? {
        let names = filenames(for: theme) + (theme == .light ? filenames(for: .dark) : [])
        return names.map { folder.appendingPathComponent($0) }
            .first { FileManager.default.isReadableFile(atPath: $0.path) }
    }

    static func install(from source: URL, for theme: HomeSceneTheme = .dark, in folder: URL = directory) throws {
        let ext = source.pathExtension.lowercased()
        guard extensions.contains(ext), NightSceneView.loadUserImage(at: source) != nil else {
            throw CocoaError(.fileReadCorruptFile)
        }
        // Read and validate before replacing anything, including when the user
        // selects the already-installed file. Atomic write preserves it on failure.
        let data = try Data(contentsOf: source)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let destination = folder.appendingPathComponent("\(theme == .dark ? "home-scene" : "home-scene-light").\(ext)")
        try data.write(to: destination, options: .atomic)
        for name in filenames(for: theme) {
            let old = folder.appendingPathComponent(name)
            if old != destination && FileManager.default.fileExists(atPath: old.path) {
                try FileManager.default.removeItem(at: old)
            }
        }
        NotificationCenter.default.post(name: didChange, object: nil)
    }

    static func clear() throws {
        for name in filenames(for: .dark) {
            let url = directory.appendingPathComponent(name)
            if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
        }
        NotificationCenter.default.post(name: didChange, object: nil)
    }

    static var hasScene: Bool { sceneURL(for: .dark) != nil }

    @MainActor @discardableResult
    static func chooseAndInstall(for theme: HomeSceneTheme = .dark) -> Bool {
        let panel = NSOpenPanel()
        panel.title = "\(theme.title) 배경 고르기"
        panel.prompt = "배경으로 쓰기"
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.png, .jpeg, .heic, .webP]
        guard panel.runModal() == .OK, let url = panel.url else { return false }
        do {
            try install(from: url, for: theme)
            return true
        } catch {
            NSAlert(error: error).runModal()
            return false
        }
    }
}
