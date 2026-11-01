# Fine — 실제 소스 저장소 (canonical)

`/Applications/Fine.app`에 설치되는 앱은 **이 저장소**에서 빌드한다.

```sh
swift test
./scripts/package-app.sh release
ditto .build/Fine.app /Applications/Fine.app
```

터미널은 libghostty다(GhosttyTerminal 패키지, sm과 같은 엔진). 옆에 `../GhosttyTerminal` 체크아웃이 있으면
그것을 쓰고(엔진을 함께 고칠 때), 없으면 github.com/oesoll/GhosttyTerminal 릴리스를 받는다(미리 빌드한 엔진 포함).

`~/cld/Fine-design`은 2026-09-09 시점의 **디자인 스냅샷 포크**다. UI 시안 전용이고,
`fine` CLI·제어 소켓·smux 브리지가 없다. 거기서 빌드한 앱을 설치하면 안 된다.

## 재시작 주의

Fine 탭 닫기는 사용자가 세션을 끝내려는 동작이다. sm 세션 탭도 `sm stop`으로 끝낸다.
앱 종료는 sm 화면만 떼며, 직접 띄운 탭만 앱과 함께 프로세스가 끝난다. 재시작 전 `fine --json tabs`로
smSession·세션 ID를 확인하고, 직접 실행 탭이 있으면 재개 방법을 먼저 알린다.

- 프로세스 이름이 전체 경로라 `pkill -x Fine`은 매칭되지 않는다. PID로 잡을 것.
- macOS에는 `setsid`가 없다. 백그라운드 재시작 스크립트에 쓰면 조용히 실패한다.
- 에이전트 셸에서 띄우면 `open`이어도 그 셸의 환경이 앱으로 넘어간다. 2026-10-31 탭 7개가 그 에이전트의
  `PEER_NAME`·메시지 소켓을 들고 떴다. 앱이 시작할 때 지우지만(InheritedAgentSession), 띄울 때도 깨끗하게:
  `env -i HOME="$HOME" USER="$USER" LOGNAME="$LOGNAME" SHELL="$SHELL" TMPDIR="$TMPDIR" PATH=/usr/bin:/bin:/usr/sbin:/sbin open /Applications/Fine.app`

## 홈 화면 배경

다크 모드 홈 위쪽 장면은 `~/.fine/home-scene.png`에 파일을 두면 바뀐다 (빌드 불필요).
번들 에셋 경로 `HarnessIcons.xcassets/HomeScene.imageset/`은 `.gitignore`에 있다 —
남의 그림을 공개 저장소에 싣지 않기 위해서다. 자세한 내용은 `docs/home-scene.md`.
