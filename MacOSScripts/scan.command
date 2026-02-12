#!/bin/bash
clear
echo "===================================================="
echo "          WINDOWS 目标扫描器 (Final Round)          "
echo "===================================================="

# 获取本地子网 (例如 192.168.1)
SUBNET=$(route -n get default | grep gateway | awk '{print $2}' | cut -d. -f1-3)

echo "[*] 正在扫描子网: $SUBNET.0/24..."

# 1. 发现存活的 IPv4 设备
for ip in $(arp -an | grep -v incomplete | awk '{print $2}' | tr -d '()'); do
    echo "----------------------------------------------------"
    echo "发现设备 IPv4: $ip"
    
    # 2. 尝试获取 NetBIOS 名称和登录信息 (macOS 原生工具)
    # smbutil lookup 会尝试解析 Windows 主机名
    NAME=$(smbutil lookup $ip 2>/dev/null | grep "IP address" -B 1 | head -n 1 | awk '{print $1}')
    echo "设备名称: ${NAME:-"未知 (可能防火墙拦截)"}"

    # 3. 尝试获取 IPv6
    IPV6=$(ping6 -c 1 -t 1 ff02::1%en0 2>/dev/null | grep $ip | awk '{print $1}')
    echo "IPv6 地址: ${IPV6:-"未发现"}"

    # 4. 关键：尝试探测当前登录名 (通过 SMB 共享信息)
    # 如果对方开启了共享，这里能看到用户目录名
    USER_INFO=$(smbutil status $ip 2>/dev/null | grep "Workgroup" -A 1 | tail -n 1 | awk '{print $1}')
    echo "潜在登录/工作组: ${USER_INFO:-"由于防护模式无法直接读取"}"
done

echo "===================================================="
echo "扫描完成！建议配合 'nmap -A -T4' 获取更详细信息。"
read -p "按回车键退出..."
