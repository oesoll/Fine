import AppKit

// fine-agent <executable> <argv0> [args…] — Fine 탭의 셸을 이 번들 이름으로 띄운다.
//
// 번들 없는 실행파일이 AppKit에 붙으면 LaunchServices는 가장 가까운 등록된 조상 앱의
// 번들(Info.plist)을 빌려 등록한다. 탭 셸이 Fine 바로 아래에 있으면 computer-use를 쓴
// claude가 Foreground "Fine" 앱이 되고, 그 claude가 띄우는 ego-browser 같은 AppKit
// 도구가 매번 새 "Fine"으로 등록된다. Dock은 이들이 끝나도 타일을 지우지 않아 Fine
// 아이콘이 수십 개 쌓였다(2026-10-26 관측). 이 번들은 LSUIElement라서, 먼저 여기로
// 등록해 두면 탭 아래 모든 프로세스가 Dock에 뜨지 않는 UIElement를 물려받는다.
//
// 등록만 하고 exec하므로 pid·pty·시그널은 그대로다. TCC 책임 프로세스는 spawn 때 정해져
// 여전히 Fine이고, 화면 기록·손쉬운 사용 권한도 그대로 쓴다(같은 날 실험으로 확인).

let arguments = CommandLine.arguments
guard arguments.count >= 3 else {
    FileHandle.standardError.write(Data("usage: fine-agent <executable> <argv0> [args…]\n".utf8))
    exit(64)
}

_ = NSApplication.shared

var argv: [UnsafeMutablePointer<CChar>?] = arguments.dropFirst(2).map { strdup($0) }
argv.append(nil)
execv(arguments[1], argv)
perror("fine-agent: execv \(arguments[1])")
exit(127)
