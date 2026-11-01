// swift-tools-version:5.9
import Foundation
import PackageDescription

// 터미널은 libghostty(GhosttyTerminal 패키지, SpaceManager와 같은 엔진). 옆에 체크아웃이 있으면 그것을
// 쓰고(엔진·입력을 함께 고치는 맥), 없으면 공개 저장소의 릴리스를 받는다 — 미리 빌드한 엔진이 따라와 zig가 필요 없다.
let siblingTerminal = Context.packageDirectory + "/../GhosttyTerminal/Package.swift"
let terminal: Package.Dependency = FileManager.default.fileExists(atPath: siblingTerminal)
    ? .package(path: "../GhosttyTerminal")
    : .package(url: "https://github.com/oesoll/GhosttyTerminal.git", from: "0.2.1")

let package = Package(
    name: "Fine",
    platforms: [.macOS(.v14)],
    products: [
        // 대소문자 구분이 없는 APFS에서 `fine`은 앱 실행파일 `Fine`과 같은 경로가 되어
        // .build 안에서 서로를 덮어쓴다. 그래서 빌드 산출물은 fine-cli이고, 설치할 때
        // ~/bin/fine 으로 복사한다 (README 참고).
        .executable(name: "fine-cli", targets: ["FineCLI"]),
    ],
    dependencies: [terminal],
    targets: [
        .executableTarget(
            name: "Fine",
            dependencies: [.product(name: "GhosttyTerminal", package: "GhosttyTerminal")],
            path: "Sources/Fine",
            resources: [.copy("Scenes"), .process("HarnessIcons.xcassets")]
        ),
        .executableTarget(name: "FineCLI", path: "Sources/FineCLI"),
        // 탭 셸을 LSUIElement 번들 이름으로 띄우는 도우미. package-app.sh가
        // Contents/Helpers/FineAgent.app으로 묶는다 (Sources/FineAgent/main.swift 참고).
        .executableTarget(name: "FineAgent", path: "Sources/FineAgent"),
        .testTarget(
            name: "FineTests",
            dependencies: ["Fine"],
            path: "Tests/FineTests"
        ),
    ]
)
