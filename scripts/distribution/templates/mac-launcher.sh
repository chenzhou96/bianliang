#!/bin/sh
set -eu
CONTENTS=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ARCH=$(uname -m)
case "$ARCH" in
  arm64) ARCH=arm64 ;;
  x86_64) ARCH=x64 ;;
  *) /usr/bin/osascript -e 'display alert "汴梁归途" message "此处理器暂不支持。"'; exit 1 ;;
esac
NODE="$CONTENTS/Resources/runtime/darwin-$ARCH/node"
if ! MESSAGE=$("$NODE" "$CONTENTS/Resources/game/launcher.mjs" "$@" 2>&1); then
  export BIANLIANG_LAUNCH_ERROR="$MESSAGE"
  /usr/bin/osascript -e 'display alert "汴梁归途启动失败" message (system attribute "BIANLIANG_LAUNCH_ERROR")'
  exit 1
fi
printf '%s\n' "$MESSAGE"
