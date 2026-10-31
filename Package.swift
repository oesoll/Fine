// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Fine",
    platforms: [.macOS(.v14)],
    products: [
        // 대소문자 구분이 없는 APFS에서 `fine`은 앱 실행파일 `Fine`과 같은 경로가 되어
        // .build 안에서 서로를 덮어쓴다. 그래서 빌드 산출물은 fine-cli이고, 설치할 때
        // ~/bin/fine 으로 복사한다 (README 참고).
        .executable(name: "fine-cli", targets: ["FineCLI"]),
    ],
    dependencies: [
        // libghostty 터미널 층. sm(WorkspaceManager)과 같은 엔진·패치·입력 처리를 함께 쓴다.
        // 이 경로 의존은 SEOL의 맥에서만 풀린다 — 공개 빌드 길은 아직 정하지 않았다(2026-10-31).
        .package(path: "../GhosttyTerminal"),
    ],
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
