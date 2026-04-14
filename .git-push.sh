#!/bin/bash
# 用于推送代码到 GitHub 的脚本

# 配置 Git 凭证（仅在当前仓库）
git config credential.helper store

# 执行推送
echo "准备推送到 GitHub..."
git push -u origin main

# 推送完成后清理凭证
# git config --unset credential.helper
