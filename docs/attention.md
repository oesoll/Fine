# Fine 노치 알림

Fine이 맥에서 알림을 받고 노치 주변에 표시한다. 별도 웹 서버나 상주 데몬을 추가하지 않는다.
로컬은 기존 `~/.fine/control.sock`, 원격은 기존 tmux-bridge의 SSH/NUC 경로를 쓴다.
일반 셸에서도 보낼 수 있으며, Fine/tmux 세션에서는 발신 주소와 프로세스 지문을 자동으로 붙인다.

```sh
# Fine / SM / 일반 맥 터미널
fine notify '어느 데이터베이스를 사용할까요?' --id database --title '결제 API'
fine notify '접속 정보를 확인해 주세요.' --id database --state blocked
fine notify '계속 진행합니다.' --id database --state working
fine notify '작업을 마쳤습니다.' --id database --state done

# 아치 등 tmux-bridge가 설치된 환경에서 맥의 사용자 호출
tmux-bridge notify mac '검토가 필요합니다.' --id review --title '아치 · 빌드'
tmux-bridge notify mac '계속 진행합니다.' --id review --state working

fine notifications list
fine notifications show
fine notifications hide
fine notifications status # 실제 화면 치수와 현재 표시 크기
fine notifications dismiss '<반환된 id>'
```

`--id`는 발신 호스트·세션 안에서의 작업 키다. 같은 키로 재전송하면 기존 항목을 갱신한다.
생략하면 독립된 알림을 만든다. `waiting`, `blocked`, `error`는 질문 카드를 펼치고,
`working`은 대기 표시를 해제하며, `done`은 30초 뒤 사라진다.
알림을 클릭하는 것은 세션 이동이며, 대기 해제와는 다르다. 카드의 ×로 명시적으로 지울 수 있다.
한 시간 동안 갱신 없는 `working`은 `unknown`으로 바뀐다. 출력이 없다는 이유로 완료나 질문을 추정하지 않는다.
질문은 앱 재시작 후에도 남는다. 재생성된 세션에는 이전 알림으로 이동하지 않도록 지문을 확인한다.

노치가 없는 모니터에서는 화면 상단 중앙에 표시한다. 질문 도착 시 키보드 포커스는 옮기지 않는다.
`Conversation → 에이전트 알림` 또는 ⇧⌘N으로 열 수 있다.
아무 알림도 없으면 숨고, 대기 중에는 반복 애니메이션이나 주기적인 로그 스캔이 없다.
접힌 상태에서는 검은 배경 없이 노치 왼쪽 6pt 옆에 8pt 점 하나만 표시한다(누를 수 있는 영역은 22×22pt).
점의 색은 가장 급한 알림의 상태다: 오류 빨강, 도움 필요 주황, 답변 필요 노랑. 개수는 펼친 노치의 오른쪽에 있다.
답변을 기다리는 알림이 없으면 점도 숨긴다. 작업 중 상태는 메뉴·단축키·호버로 목록을 열어 확인한다.
`NSScreen`의 좌우 안전 영역 사이 간격과 `safeAreaInsets.top`에서 실제 노치 위치를 읽는다.
쉬는 상태의 검은 면은 실제 노치(이 맥에서 179×32pt)와 같은 크기라서, 알림이 오면 노치에서 자라나오고 닫히면 노치로 흡수된다.
메뉴 막대와 만나는 위 모서리는 바깥으로 오목하게, 아래 모서리는 연속 곡률로 굴린다.
알림 도착 시 노치 폭+112pt(이 맥에서 291pt)로 넓어져 맨 위 알림 한 줄을 보여주고, 6초 뒤 접는다.
호버하면 같은 폭을 유지한 채 아래로만 펼친다. 맨 위 알림의 위치는 확장 중에도 고정한다.
목록은 워크스페이스로 묶는다. tmux 세션 하나가 워크스페이스 하나이고(SM과 같은 기준), 발신 bridge가 자기 패널의 세션 이름을 실어 보낸다.
Fine 탭에서 온 알림은 `Fine`, 세션 정보가 없는 옛 발신은 호스트 이름으로 묶는다. 가장 급한 알림이 있는 묶음이 위로 오고,
묶음 안에서는 답변이 필요한 알림(상태 점·프로젝트·최대 두 줄 메시지)이 먼저, 작업 중·완료 세션은 한 줄씩 작게 그 아래에 둔다.
같은 하네스 대화(`claude:<세션 ID>`)가 재개되어 새 탭·패널에서 보고하면 예전 주소의 항목은 대체된다.
줄 전체가 세션 열기이고, ×는 호버할 때만 나온다. 380pt를 넘으면 세로로 스크롤한다. 좌우 넘기기는 없다.
노치나 점에 60ms 호버하면 목록을 연다(메뉴로 가며 스쳐 지나가는 커서는 거른다). 화면 맨 윗줄에 붙인 커서도 노치로 판정한다.
목록으로 이동하면 유지하고, 노치와 목록 바깥으로 나가면 300ms 뒤 닫는다. 마우스 이동 이벤트만 관찰하며 폴링이나 투명 가림 창은 없다.
모양은 화면에 보이는 값에서 시작하는 스프링으로 바뀐다. 열릴 때는 아주 약하게 튕기고, 닫힐 때는 튕기지 않고 더 빠르다.
열릴 때는 검은 면이 먼저, 글자가 뒤따르고 나머지 줄은 30ms 간격으로 내려앉는다. 닫힐 때는 글자가 먼저 사라진다.
글자 크기나 가로 배치는 전환 중에 변하지 않는다. 카메라 하드웨어 영역에는 콘텐츠를 놓지 않는다.
바깥 클릭이나 Escape로도 접는다. 키보드 열기·닫기와 동작 줄이기는 즉시 전환한다.

## 자동 상태 이벤트

새 Fine 앱과 CLI를 적용한 뒤 설치한다. 다른 훅은 보존하며 변경 전 파일을 백업한다.

```sh
python3 scripts/install-attention-hooks.py
# 원격 호스트에서는 이 스크립트와 fine-attention-hook.py를 같은 폴더에 두고:
python3 install-attention-hooks.py --host mac
# Fine 훅만 제거:
python3 scripts/install-attention-hooks.py --remove
```

Claude의 `~/.claude/settings.json`과 Codex의 `~/.codex/hooks.json`을 갱신한다.
Codex에서는 `/hooks`로 새 정의를 검토하고 신뢰해야 실행된다.
기존 권한 결정을 바꾸지 않으며, 전달 실패도 에이전트를 중단하지 않는다.
성공적인 전달 응답이 있어야 로컬 중복 억제 기록을 갱신한다.

시작·권한 요청·구조화된 질문·도구 재개·응답 종료를 연결한다.
자연어로만 질문하거나 논리적인 병목에 도달한 경우에는 `notify`를 명시적으로 호출한다.
일반 도구 실패는 에이전트가 스스로 복구할 수 있으므로 사용자 개입으로 분류하지 않는다.
하위 에이전트 훅은 부모와 터미널을 공유하므로 무시한다. 필요하면 별도의 작업 ID로 호출한다.
직접 만든 작업 ID는 같은 ID의 후속 이벤트나 명시적인 지우기로 해제한다.

훅 계약: [Claude 공식 문서](https://code.claude.com/docs/en/hooks),
[Codex 공식 문서](https://learn.chatgpt.com/docs/hooks).

## 전제와 경계

- 수신 맥에서 업데이트된 Fine이 실행 중이어야 한다. 꺼져 있거나 연결이 끊기면 CLI가 실패를 반환한다.
  재연결 후 사용자가 이미 봤을 수도 있는 질문을 무작정 재전송하지 않는다.
- 원격 송수신 양쪽에 `notify`/`focus`를 지원하는 브리지가 필요하다.
- tmux 알림 클릭은 원격 패널을 선택한 뒤 호스트와 세션명이 일치하는 SM 워크스페이스로 이동한다.
  SM에 등록되지 않은 일반 tmux 세션은 자동으로 창을 새로 만들지 않는다.
- 일반 셸/CI처럼 세션 주소가 없으면 알림 표시는 가능하지만 세션 이동은 없다.
- 원격 전달은 설정된 개인 SSH/NUC 네트워크 안에서 동작한다. 인터넷에 공개하는 알림 서비스가 아니다.
- 모든 상태는 명시적인 이벤트에서 온다. 훅이나 `notify`를 연결하지 않은 하네스를 상시 추적하지 않는다.

## 검증

```sh
swift test --filter Attention
python3 scripts/test-attention-hooks.py
python3 scripts/test-attention-e2e.py
# 이 사용자의 Arch/NUC 연결이 있을 때만 실제 네트워크 검증:
python3 scripts/test-attention-network.py
```

E2E는 `FINE_HOME`과 별도의 tmux 소켓으로 격리한다. 실행 중인 Fine을 종료하거나 덮어쓰지 않는다.
렌더와 영수증은 `.build/attention-review/`에 남는다.
