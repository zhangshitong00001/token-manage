#!/bin/bash
# ============================================================
# TokenManager 安全构建与部署脚本
# 防止 OOM 导致服务下线
# ============================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ADMIN_DIR="$PROJECT_DIR/admin"
MOBILE_DIR="$PROJECT_DIR/mobile"

echo "========================================"
echo " TokenManager 构建部署"
echo " 内存: $(free -h | awk '/Mem:/{print $3"/"$2}')"
echo "========================================"

# 1. 停止后端服务，释放约 100MB 内存
echo ""
echo "[1/4] 停止后端服务释放内存..."
if systemctl is-active tokenmanager &>/dev/null; then
    systemctl stop tokenmanager
    echo "  ✓ 后端已停止"
else
    echo "  - 后端未运行"
fi

# 2. 内存限制：Node.js V8 堆上限 512MB + 新生代 128MB
export NODE_OPTIONS="--max-old-space-size=512 --max-semi-space-size=128"
export NODE_ENV=production

# 3. 构建 admin（最吃内存）
echo ""
echo "[2/4] 构建 Admin 前端..."
cd "$ADMIN_DIR"
npm run build 2>&1 | tail -5
if [ $? -eq 0 ]; then
    echo "  ✓ Admin 构建成功"
else
    echo "  ✗ Admin 构建失败！"
    echo "  尝试：增大 NODE_OPTIONS 或手动 stop 更多服务后重试"
    systemctl start tokenmanager 2>/dev/null || true
    exit 1
fi

# 4. 构建 mobile（相对轻量）
echo ""
echo "[3/4] 构建 Mobile 前端..."
cd "$MOBILE_DIR"
npm run build 2>&1 | tail -5
if [ $? -eq 0 ]; then
    echo "  ✓ Mobile 构建成功"
else
    echo "  ✗ Mobile 构建失败"
    systemctl start tokenmanager 2>/dev/null || true
    exit 1
fi

# 5. 重启后端（加载新静态文件）
echo ""
echo "[4/4] 重启后端服务..."
systemctl daemon-reload 2>/dev/null || true
systemctl start tokenmanager || systemctl restart tokenmanager
sleep 2
if systemctl is-active tokenmanager &>/dev/null; then
    echo "  ✓ 后端已启动"
else
    echo "  ✗ 后端启动失败！"
    systemctl status tokenmanager --no-pager | tail -5
    exit 1
fi

# 6. 验证
echo ""
echo "========================================"
echo " 部署完成！"
echo " 后端状态: $(systemctl is-active tokenmanager)"
echo " 内存使用: $(free -h | awk '/Mem:/{print $3"/"$2}')"
echo "========================================"
