import machine
import math
import json
import time
import sys

# 전원 인가 후 센서가 완전히 켜질 때까지 약간 대기 (매우 중요)
time.sleep(1)

# I2C 설정 (SDA: GP0, SCL: GP1)
i2c = machine.I2C(0, sda=machine.Pin(0), scl=machine.Pin(1), freq=400000)
MPU_ADDR = 0x68

PWR_MGMT_1 = 0x6B
ACCEL_XOUT_H = 0x3B

def init_mpu():
    try:
        # 슬립 모드 해제
        i2c.writeto_mem(MPU_ADDR, PWR_MGMT_1, b'\x00')
        time.sleep(0.1)
        return True
    except OSError:
        return False

def read_raw_data(addr):
    high = i2c.readfrom_mem(MPU_ADDR, addr, 1)[0]
    low = i2c.readfrom_mem(MPU_ADDR, addr+1, 1)[0]
    val = (high << 8) | low
    if val > 32768:
        val = val - 65536
    return val

# 센서가 연결될 때까지 계속 재시도 (부팅 실패 방지)
while not init_mpu():
    print("Error: Waiting for MPU6050... Check GP0/GP1 wiring.")
    time.sleep(1)

# 메인 루프
while True:
    try:
        acc_x = read_raw_data(ACCEL_XOUT_H)
        acc_y = read_raw_data(ACCEL_XOUT_H + 2)
        acc_z = read_raw_data(ACCEL_XOUT_H + 4)
        
        roll = math.atan2(acc_y, acc_z) * 180.0 / math.pi
        pitch = math.atan2(-acc_x, math.sqrt(acc_y * acc_y + acc_z * acc_z)) * 180.0 / math.pi
        
        roll = round(roll, 1)
        pitch = round(pitch, 1)
        
        data = {
            "roll": roll,
            "pitch": pitch
        }
        
        # 확실하게 Flush(밀어내기) 처리
        sys.stdout.write(json.dumps(data) + '\r\n')
        
    except OSError:
        print("Error: I2C read failed")
        
    time.sleep(0.05)
