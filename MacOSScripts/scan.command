#!/bin/bash
clear
echo "===================================================="
echo "          局域网用户-IP 关联探测器 (macOS版)          "
echo "===================================================="

# 指定你之前发现的活跃网段
NETWORK="10.0.192"

echo "[*] 正在扫描网段: $NETWORK.0/24..."
echo "[*] 注意：若目标开启强力防火墙，用户名可能显示为“未知”"
echo "----------------------------------------------------"

for i in {1..254}; do
    IP="$NETWORK.$i"
    
    # 快速确认 IP 是否在线
    if ping -c 1 -t 0.5 $IP > /dev/null 2>&1; then
        
        # 1. 抓取 NetBIOS 信息 (最容易暴露用户名的地方)
        # Windows 的 NetBIOS 会话中，<03> 记录通常是当前登录的用户名
        NB_INFO=$(nmblookup -A $IP 2>/dev/null)
        HOSTNAME=$(echo "$NB_INFO" | grep '<00>' | grep -v 'GROUP' | head -n 1 | awk '{print $1}')
        USER_LOGGED=$(echo "$NB_INFO" | grep '<03>' | grep -v 'GROUP' | head -n 1 | awk '{print $1}')
        
        # 2. 如果方法1失败，尝试 SMB 状态探测
        if [ -z "$HOSTNAME" ]; then
            HOSTNAME=$(smbutil status $IP 2>/dev/null | grep "Server:" | awk '{print $2}')
        fi

        # 3. 输出结果
        if [ ! -z "$HOSTNAME" ] || [ ! -z "$USER_LOGGED" ]; then
            echo "IPv4 地址: $IP"
            echo "设备名称: ${HOSTNAME:-"未知"}"
            echo "当前登录: ${USER_LOGGED:-"无法读取 (账号已隐藏)"}"
            echo "----------------------------------------------------"
        fi
    fi
done

echo "[*] 扫描完成！"
read -p "按回车退出..."
