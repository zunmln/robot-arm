document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const consoleOutput = document.getElementById('consoleOutput');
    const sequenceList = document.getElementById('sequenceList');

    // Sliders
    const sliders = {
        base: document.getElementById('baseSlider'),
        shoulder: document.getElementById('shoulderSlider'),
        elbow: document.getElementById('elbowSlider'),
        wrist: document.getElementById('wristSlider'),
        gripper: document.getElementById('gripperSlider')
    };

    // Value Displays
    const displays = {
        base: document.getElementById('baseVal'),
        shoulder: document.getElementById('shoulderVal'),
        elbow: document.getElementById('elbowVal'),
        wrist: document.getElementById('wristVal'),
        gripper: document.getElementById('gripperVal')
    };

    // Buttons
    const btnHome = document.getElementById('btnHome');
    const btnStop = document.getElementById('btnStop');
    const btnSavePos = document.getElementById('btnSavePos');
    const btnPlaySeq = document.getElementById('btnPlaySeq');
    const btnClearSeq = document.getElementById('btnClearSeq');

    // State
    let isConnected = false;
    let sequence = [];
    let isPlaying = false;

    // --- Logging System ---
    function log(message, type = 'info') {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        const div = document.createElement('div');
        div.className = `log ${type}`;
        div.textContent = `[${time}] ${message}`;
        consoleOutput.appendChild(div);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }

    // --- Mock Hardware Connection ---
    function connectHardware() {
        log('ESP32 / 컨트롤러 연결을 시도합니다...', 'system');
        setTimeout(() => {
            isConnected = true;
            statusDot.classList.remove('offline');
            statusDot.classList.add('online');
            statusText.textContent = '하드웨어 연결됨 (가상 모드)';
            log('WebSocket 통신 포트 개방 완료. 제어 가능합니다.', 'success');
        }, 1500);
    }

    // --- Send Command to Hardware ---
    function sendCommand(joint, value) {
        if (!isConnected) return;
        
        // 실제 하드웨어 통신 시: websocket.send(JSON.stringify({ joint, value }));
        // 여기서는 콘솔에 출력만 합니다.
        log(`CMD 송신 > {"cmd":"MOVE", "joint":"${joint}", "val":${value}}`, 'cmd');
    }

    // --- Slider Events ---
    Object.keys(sliders).forEach(key => {
        const slider = sliders[key];
        const display = displays[key];

        // 실시간 드래그 중 UI 업데이트
        slider.addEventListener('input', (e) => {
            const val = e.target.value;
            display.textContent = key === 'gripper' ? `${val}%` : `${val}°`;
        });

        // 드래그가 끝났을 때(change) 명령 전송
        slider.addEventListener('change', (e) => {
            if (isPlaying) {
                e.preventDefault();
                log('재생 중에는 수동 조작이 무시됩니다.', 'err');
                return;
            }
            sendCommand(key, parseInt(e.target.value));
        });
    });

    // --- Home Button ---
    btnHome.addEventListener('click', () => {
        if (isPlaying) return;
        log('Home 위치로 초기화 명령 송신', 'info');
        
        const homeValues = { base: 90, shoulder: 90, elbow: 90, wrist: 90, gripper: 50 };
        
        Object.keys(sliders).forEach(key => {
            sliders[key].value = homeValues[key];
            displays[key].textContent = key === 'gripper' ? `${homeValues[key]}%` : `${homeValues[key]}°`;
            sendCommand(key, homeValues[key]);
        });
    });

    // --- Emergency Stop ---
    btnStop.addEventListener('click', () => {
        isPlaying = false;
        log('!!! 비상 정지 명령 (E-STOP) !!! 모든 모터 정지', 'err');
        // 실제 환경: websocket.send('{"cmd":"ESTOP"}');
    });

    // --- Sequence Management ---
    btnSavePos.addEventListener('click', () => {
        const pos = {
            base: sliders.base.value,
            shoulder: sliders.shoulder.value,
            elbow: sliders.elbow.value,
            wrist: sliders.wrist.value,
            gripper: sliders.gripper.value
        };
        sequence.push(pos);
        
        const li = document.createElement('li');
        li.innerHTML = `Step ${sequence.length} <span>B:${pos.base} S:${pos.shoulder} E:${pos.elbow} W:${pos.wrist} G:${pos.gripper}</span>`;
        sequenceList.appendChild(li);
        
        log(`위치 저장 완료 (Step ${sequence.length})`, 'info');
    });

    btnClearSeq.addEventListener('click', () => {
        sequence = [];
        sequenceList.innerHTML = '';
        log('저장된 시퀀스가 초기화되었습니다.', 'system');
    });

    btnPlaySeq.addEventListener('click', async () => {
        if (sequence.length === 0) {
            log('재생할 시퀀스가 없습니다. 먼저 위치를 저장하세요.', 'err');
            return;
        }
        if (isPlaying) return;

        isPlaying = true;
        log('--- 시퀀스 자동 재생 시작 ---', 'info');

        for (let i = 0; i < sequence.length; i++) {
            if (!isPlaying) {
                log('재생이 중단되었습니다.', 'err');
                break;
            }
            
            const pos = sequence[i];
            log(`Step ${i+1} 이동 중...`, 'info');
            
            // UI 업데이트 및 전송
            Object.keys(pos).forEach(key => {
                sliders[key].value = pos[key];
                displays[key].textContent = key === 'gripper' ? `${pos[key]}%` : `${pos[key]}°`;
                sendCommand(key, parseInt(pos[key]));
            });

            // 각 스텝별 1.5초 대기 (실제 로봇의 이동 시간 확보)
            await new Promise(r => setTimeout(r, 1500));
        }

        if (isPlaying) {
            log('--- 시퀀스 재생 완료 ---', 'success');
            isPlaying = false;
        }
    });

    // Start
    connectHardware();
});
