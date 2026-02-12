#!/bin/bash
clear
echo "===================================================="
echo "          强力协议探测器 (Bypass Ping版)            "
echo "===================================================="

# 目标网段
NETWORK="10.0.192"

echo "[*] 正在扫描网段: $NETWORK.1 到 $NETWORK.60 ..."
echo "[*] 正在绕过防火墙 ICMP 限制，直接探测协议..."
echo "----------------------------------------------------"

# 只扫描你之前发现有机器的范围，节省时间
for i in {5..60}; do
    IP="$NETWORK.$i"
    
    # 直接尝试 NetBIOS 探测，不检查 ping
    # -U 选项会尝试使用 UDP 广播，有时能穿透简单防火墙
    NB_INFO=$(nmblookup -A $ip 2>/dev/null | grep -v 'failed')
    
    if [ ! -z "$NB_INFO" ]; then
        HOSTNAME=$(echo "$NB_INFO" | grep '<00>' | grep -v 'GROUP' | head -n 1 | awk '{print $1}')
        USER_LOGGED=$(echo "$NB_INFO" | grep '<03>' | grep -v 'GROUP' | head -n 1 | awk '{print $1}')
        
        echo "发现目标 IP: $IP"
        echo "设备名称: ${HOSTNAME:-"未知"}"
        echo "当前登录: ${USER_LOGGED:-"由于防护无法读取"}"
        echo "----------------------------------------------------"
    fi
done

echo "[*] 深度扫描完成！"
read -p "按回车退出..."
