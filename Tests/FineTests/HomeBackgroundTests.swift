import AppKit
import Testing
@testable import Fine

@MainActor
struct HomeBackgroundTests {
    @Test func selectionsPersistIndependentlyAndCycleWithoutUnavailablePhotos() throws {
        let suite = "HomeBackgroundTests.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let settings = HomeBackgroundSettings(defaults: defaults)
        #expect(settings.light == .forest)
        #expect(settings.dark == .photo)
        settings.select(.auroraWindow, for: .dark)
        settings.cycle(1, for: .light, hasPhoto: false)
        #expect(settings.light == .aurora)
        #expect(settings.dark == .auroraWindow)
        let restored = HomeBackgroundSettings(defaults: defaults)
        #expect(restored.light == .aurora)
        #expect(restored.dark == .auroraWindow)
        restored.select(.plain, for: .light)
        restored.cycle(1, for: .light, hasPhoto: false)
        #expect(restored.light == .forest)
        restored.cycle(-1, for: .light, hasPhoto: false)
        #expect(restored.light == .plain)
        restored.select(.auroraWindow, for: .light)
        restored.cycle(1, for: .light, hasPhoto: false)
        #expect(restored.light == .plain)
        restored.select(.auroraWindow, for: .light)
        restored.cycle(1, for: .light, hasPhoto: true)
        #expect(restored.light == .photo)
    }

    @Test func importsPreserveLegacyPhotoAndFailedReplacements() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let original = directory.appendingPathComponent("source.png")
        let bitmap = try #require(NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 20, pixelsHigh: 10,
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
            colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0))
        bitmap.setColor(.red, atX: 0, y: 0)
        let darkData = try #require(bitmap.representation(using: .png, properties: [:]))
        try darkData.write(to: original)
        try HomeSceneLibrary.install(from: original, for: .dark, in: directory)
        let legacy = directory.appendingPathComponent("home-scene.png")
        #expect(HomeSceneLibrary.sceneURL(for: .dark, in: directory) == legacy)
        #expect(HomeSceneLibrary.sceneURL(for: .light, in: directory) == legacy)
        // Selecting the already-installed file is safe.
        try HomeSceneLibrary.install(from: legacy, for: .dark, in: directory)
        #expect(try Data(contentsOf: legacy) == darkData)

        bitmap.setColor(.blue, atX: 0, y: 0)
        let lightData = try #require(bitmap.representation(using: .png, properties: [:]))
        try lightData.write(to: original)
        try HomeSceneLibrary.install(from: original, for: .light, in: directory)
        let light = try #require(HomeSceneLibrary.sceneURL(for: .light, in: directory))
        #expect(light.lastPathComponent == "home-scene-light.png")
        #expect(try Data(contentsOf: legacy) == darkData)
        #expect(try Data(contentsOf: light) == lightData)

        try Data("broken image".utf8).write(to: original)
        #expect(throws: (any Error).self) { try HomeSceneLibrary.install(from: original, for: .light, in: directory) }
        #expect(try Data(contentsOf: light) == lightData)
        #expect(try Data(contentsOf: legacy) == darkData)
    }
}
