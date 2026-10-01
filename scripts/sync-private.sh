#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# 从公开模板仓库同步到「私有部署仓库」。
#
#   ./scripts/sync-private.sh
#
# 做的事：
#   1. 拉取公开仓库（wedding-invitation）的最新代码 —— 它是唯一代码源
#   2. 拷入本机私密文件：.env、assets-src/hero-source.jpg、wrangler.toml
#   3. 在私有仓库里生成派生产物（真实照片压缩图）
#
# 私密文件只存在于本机与私有仓库，公开仓库永不接触。
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

PUBLIC_REPO="git@github.com:green-dalii/wedding-invitation.git"
SRC="${SRC:-$HOME/project/wedding/web}"
DST="${DST:-$HOME/project/wedding/deploy/wedding-invitation-private}"

SECRETS=(
  ".env"                        # 真实姓名 / 坐标 / 航班 / 高德 key
  "assets-src/hero-source.jpg"  # 真实照片
  "wrangler.toml"               # 真实 D1 database_id
)

echo "▸ 源（模板）：$SRC"
echo "▸ 目标（私密）：$DST"
[ -d "$SRC" ] || { echo "✗ 找不到模板目录 $SRC"; exit 1; }
mkdir -p "$DST"

# ── 1. 同步代码：只取受版本控制的文件，避免带入 .env / 派生物 ──
echo "▸ 同步代码…"
if [ -d "$SRC/.git" ]; then
  # 用 git archive 取 HEAD 的干净快照（天然排除未跟踪与被忽略的文件）
  git -C "$SRC" archive HEAD | tar -x -C "$DST"
else
  echo "  ⚠️ $SRC 不是 git 仓库，改用文件复制（会排除 .env 与派生物）"
  rsync -a --delete \
    --exclude '.git' --exclude 'node_modules' --exclude 'dist' \
    --exclude '.env' --exclude 'assets-src/hero-source.jpg' \
    --exclude 'src/assets' --exclude 'public/og.jpg' --exclude 'src/generated' \
    "$SRC"/ "$DST"/
fi

# ── 2. 先装依赖（必须 --ignore-scripts）──
# npm install 的 prepare 脚本会生成**占位图并覆盖 assets-src/hero-source.jpg**，
# 必须在拷入真实照片之前完成，且跳过脚本。
echo "▸ 安装依赖（跳过 prepare，避免占位图覆盖真实照片）…"
( cd "$DST" && npm install --silent --no-audit --no-fund --ignore-scripts >/dev/null )

# ── 3. 再拷入私密文件 ──
echo "▸ 拷入私密文件…"
missing=0
for f in "${SECRETS[@]}"; do
  if [ -f "$SRC/$f" ]; then
    mkdir -p "$DST/$(dirname "$f")"
    cp "$SRC/$f" "$DST/$f"
    echo "  ✓ $f"
  else
    echo "  ✗ 缺失：$SRC/$f"
    missing=1
  fi
done
[ "$missing" -eq 0 ] || { echo "✗ 有私密文件缺失，请先在模板目录补齐"; exit 1; }

# 校验照片未被占位图覆盖（对比哈希）
src_sha=$(shasum -a 256 "$SRC/assets-src/hero-source.jpg" | cut -d' ' -f1)
dst_sha=$(shasum -a 256 "$DST/assets-src/hero-source.jpg" | cut -d' ' -f1)
if [ "$src_sha" != "$dst_sha" ]; then
  echo "✗ 照片校验失败：拷贝后内容不一致"; exit 1
fi
echo "  ✓ 照片校验一致 (${src_sha:0:12}…)"

# ── 4. 生成派生产物（真实照片压缩图，Cloudflare 构建时用得到）──
echo "▸ 生成派生产物…"
( cd "$DST" && node scripts/optimize-hero.mjs )

echo ""
echo "✓ 同步完成。下一步："
echo "  cd $DST"
echo "  git add -A && git commit -m 'sync: 更新部署配置' && git push"