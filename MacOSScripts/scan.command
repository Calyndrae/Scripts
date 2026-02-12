#!/bin/bash
clear
echo "===================================================="
echo "          极速强力扫描器 (TOP 5 TARGETS)            "
echo "===================================================="

# 自动检测你的网段
SUBNET="10.0.192"
echo "[*] 正在扫描网段: $SUBNET.x ..."
echo "[*] 正在尝试多种协议解析设备名..."

count=0
# 遍历可能的 IP 范围 (根据你之前的扫描结果)
for i in {5..60}; do
    if [ $count -ge 5 ]; then break; fi
    
    IP="$SUBNET.$i"
    
    # 快速 Ping 检测存活
    if ping -c 1 -t 1 $IP > /dev/null 2>&1; then
        echo "----------------------------------------------------"
        echo "目标 [$((count+1))]: $IP"
        
        # 1. 尝试 DNS 逆向解析 (最快)
        NAME=$(host $IP | awk '{print $NF}' | sed 's/\.$//')
        if [[ "$NAME" == *"pointer"* || "$NAME" == *"reached"* ]]; then NAME="未知"; fi
        
        # 2. 尝试 NetBIOS (强力探测)
        if [ "$NAME" == "未知" ]; then
            NAME=$(nmblookup -A $IP | grep '<00>' | grep -v 'GROUP' | head -n 1 | awk '{print $1}')
        fi
        
        # 3. 尝试 SMB 状态探测
        if [ -z "$NAME" ]; then
            NAME=$(smbutil status $IP 2>/dev/null | grep "Server:" | awk '{print $2}')
        fi

        # 4. 获取 IPv6
        IPV6=$(ndp -an | grep $IP | awk '{print $1}' | head -n 1)

        echo "设备名称: ${NAME:-"无法解析 (防火墙严密封锁)"}"
        echo "IPv6 地址: ${IPV6:-"未发现"}"
        
        ((count++))
    fi
done

echo "===================================================="
echo "扫描前 5 台设备完成。"
read -p "按回车键退出..."
