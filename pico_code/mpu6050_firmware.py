import machine
import math
import json
import time

# I2C 설정 (SDA: GP0, SCL: GP1)
# MPU6050의 기본 I2C 주소는 0x68 (또는 0x69)
i2c = machine.I2C(0, sda=machine.Pin(0), scl=machine.Pin(1), freq=400000)
MPU_ADDR = 0x68

# MPU6050 레지스터 주소
PWR_MGMT_1 = 0x6B
ACCEL_XOUT_H = 0x3B

def init_mpu():
    """MPU6050을 깨우고 초기화합니다."""
    try:
        # 슬립 모드 해제 (0x6B 레지스터에 0x00 기록)
        i2c.writeto_mem(MPU_ADDR, PWR_MGMT_1, b'\x00')
        time.sleep(0.1)
        return True
    except OSError:
        # I2C 통신 실패 시 (연결 불량, 주소 틀림 등)
        return False

def read_raw_data(addr):
    """16비트 레지스터 값을 읽어옵니다."""
    high = i2c.readfrom_mem(MPU_ADDR, addr, 1)[0]
    low = i2c.readfrom_mem(MPU_ADDR, addr+1, 1)[0]
    
    # 16비트로 합치기
    val = (high << 8) | low
    
    # 부호 있는 정수(2의 보수)로 변환
    if val > 32768:
        val = val - 65536
    return val

# 센서 초기화 시도
if not init_mpu():
    # USB 시리얼을 통해 웹으로 에러 메시지 전송 (JSON 포맷 아님)
    print("Error: MPU6050 not found! Check SDA(GP0), SCL(GP1) wiring.")
    while True:
        time.sleep(1)

# 메인 루프: 가속도 센서를 읽어 기울기(Roll, Pitch)를 계산하고 JSON으로 출력
while True:
    try:
        # 가속도 센서 원시 데이터 읽기 (X, Y, Z)
        acc_x = read_raw_data(ACCEL_XOUT_H)
        acc_y = read_raw_data(ACCEL_XOUT_H + 2)
        acc_z = read_raw_data(ACCEL_XOUT_H + 4)
        
        # 가속도 값을 이용해 Roll(좌우 기울기), Pitch(앞뒤 기울기) 계산
        # 단위는 각도(Degree)
        roll = math.atan2(acc_y, acc_z) * 180.0 / math.pi
        pitch = math.atan2(-acc_x, math.sqrt(acc_y * acc_y + acc_z * acc_z)) * 180.0 / math.pi
        
        # 불필요한 소수점 정리 (1자리까지만)
        roll = round(roll, 1)
        pitch = round(pitch, 1)
        
        # 웹 브라우저(Web Serial)로 데이터 전송 (JSON 포맷)
        data = {
            "roll": roll,
            "pitch": pitch
        }
        
        # sys.stdout을 통해 USB 시리얼 포트로 전송됨
        print(json.dumps(data))
        
    except OSError:
        # 간헐적인 I2C 통신 에러 무시
        pass
        
    # 웹앱의 3D 렌더링이 부드럽게 이어지도록 약 0.05초 대기 (초당 20회 전송)
    time.sleep(0.05)
