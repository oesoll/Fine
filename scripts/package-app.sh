#!/bin/zsh
set -euo pipefail

configuration="${1:-release}"
repository_root="${0:A:h:h}"
bundle="$repository_root/.build/Fine.app"
binary="$repository_root/.build/$configuration/Fine"
resource_bundle="$repository_root/.build/$configuration/Fine_Fine.bundle"

cd "$repository_root"
swift build -c "$configuration"

# TCC(화면 기록·손쉬운 사용)는 ad-hoc 서명이면 빌드 해시에 묶여, 설치할 때마다 허용이
# 풀린다. 개발자 인증서로 서명하면 "이 팀의 com.seol.fine"에 묶여 재빌드에도 유지된다.
# 인증서가 없는 기계에서는 ad-hoc으로 되돌아간다. FINE_SIGN_IDENTITY로 덮어쓸 수 있다.
identity="${FINE_SIGN_IDENTITY:-$(security find-identity -v -p codesigning 2>/dev/null | awk -F'"' '/Apple Development/ { print $2; exit }')}"
identity="${identity:--}"

rm -rf "$bundle"
mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources"
cp "$binary" "$bundle/Contents/MacOS/Fine"
cp "$repository_root/App/Info.plist" "$bundle/Contents/Info.plist"
cp "$repository_root/Assets/AppIcon.icns" "$bundle/Contents/Resources/AppIcon.icns"
cp -R "$resource_bundle" "$bundle/Contents/Resources/Fine_Fine.bundle"

# 탭 셸 도우미: 안쪽 번들을 먼저 서명해야 바깥 서명이 그 봉인을 담는다.
agent="$bundle/Contents/Helpers/FineAgent.app"
mkdir -p "$agent/Contents/MacOS" "$agent/Contents/Resources"
cp "$repository_root/.build/$configuration/FineAgent" "$agent/Contents/MacOS/fine-agent"
cp "$repository_root/App/FineAgent-Info.plist" "$agent/Contents/Info.plist"
cp "$repository_root/Assets/AppIcon.icns" "$agent/Contents/Resources/AppIcon.icns"
codesign --force -s "$identity" "$agent"

codesign --force -s "$identity" "$bundle"

echo "$bundle"
