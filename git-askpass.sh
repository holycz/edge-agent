#!/bin/bash
# Git 凭证提供脚本

# 检查是否是密码请求
if echo "$1" | grep -q "Password"; then
    # 输出 token 作为密码
    echo "${GITHUB_TOKEN}"
    exit 0
fi

# 如果是用户名请求
echo "holycz"
