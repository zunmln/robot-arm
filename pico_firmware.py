# pico_firmware.py
import machine
import json
import sys
import select
from time import sleep

# 서보 모터 핀 설정 (예시: GPIO 15, 14, 13, 12, 11)
# ⚠️ 실제 모터를 연결한 핀 번호에 맞게 수정하세요.
SERVO_PINS = {
    "base": 15,
    "shoulder": 14,
    "elbow": 13,
    "wrist": 12,
    "gripper": 11
}

# PWM 객체 초기화
servos = {}
for name, pin in SERVO_PINS.items():
    pwm = machine.PWM(machine.Pin(pin))
    pwm.freq(50) # 서보 모터 표준 주파수 50Hz
    servos[name] = pwm

def set_angle(joint, angle):
    """각도를 입력받아 PWM duty cycle로 변환 후 서보 모터 제어"""
    if joint not in servos:
        return
    
    pwm = servos[joint]
    
    # gripper는 0~100% 값을 받음. 이를 서보 각도(0~180도)로 변환
    if joint == "gripper":
        # 0% -> 닫힘 (예: 30도), 100% -> 완전히 열림 (예: 150도)
        # ⚠️ 하드웨어 그리퍼의 가동 범위에 맞게 각도를 튜닝해야 모터가 타지 않습니다.
        angle = 30 + (angle / 100.0) * 120
    
    # angle: 0 ~ 180도
    # duty_u16: 50Hz 기준 보통 1ms~2ms (0~180도). 보드에 따라 0.5ms~2.5ms
    # 계산식: 0도 -> duty 1638 (~0.5ms), 180도 -> duty 8192 (~2.5ms)
    min_duty = 1638
    max_duty = 8192
    
    # 안전 장치 (각도 제한)
    if angle < 0: angle = 0
    if angle > 180: angle = 180
        
    duty = int(min_duty + (angle / 180.0) * (max_duty - min_duty))
    pwm.duty_u16(duty)

# 초기 Home 위치 세팅
print("Initializing servos...")
for name in SERVO_PINS:
    set_angle(name, 90 if name != "gripper" else 50)

print("Robot Arm Controller Ready. Waiting for JSON commands via USB Serial...")

# USB 입력을 막힘(Blocking) 없이 받기 위한 설정
poll_obj = select.poll()
poll_obj.register(sys.stdin, select.POLLIN)

while True:
    try:
        # 입력이 들어왔는지 10ms 동안 체크
        poll_results = poll_obj.poll(10)
        
        if poll_results:
            # 입력된 데이터 한 줄 읽어오기
            line = sys.stdin.readline().strip()
            if not line:
                continue
                
            # 웹에서 전송한 JSON 문자열 파싱 (예: {"joint": "base", "val": 90})
            data = json.loads(line)
            
            if "joint" in data and "val" in data:
                joint = data["joint"]
                val = data["val"]
                set_angle(joint, val)
                
    except ValueError:
        # JSON 파싱 실패 에러 무시
        pass
    except Exception as e:
        # 기타 에러 발생 시 무시하고 계속 동작
        pass
