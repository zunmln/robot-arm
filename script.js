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
    const btnConnectUSB = document.getElementById('btnConnectUSB');

    // State
    let isConnected = false;
    let sequence = [];
    let isPlaying = false;
    
    // Serial Data
    let port;
    let writer;

    // --- Logging System ---
    function log(message, type = 'info') {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        const div = document.createElement('div');
        div.className = `log ${type}`;
        div.textContent = `[${time}] ${message}`;
        consoleOutput.appendChild(div);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }

    // --- Web Serial API Connection ---
    btnConnectUSB.addEventListener('click', async () => {
        try {
            if (!navigator.serial) {
                log('Web Serial API 미지원 브라우저입니다. 크롬이나 엣지를 사용해주세요.', 'err');
                return;
            }
            port = await navigator.serial.requestPort();
            await port.open({ baudRate: 115200 });
            
            const textEncoder = new TextEncoderStream();
            const writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
            writer = textEncoder.writable.getWriter();
            
            isConnected = true;
            statusDot.classList.remove('offline');
            statusDot.classList.add('online');
            statusText.textContent = 'Pico (USB) 연결됨';
            btnConnectUSB.style.display = 'none';
            log('Pico 하드웨어와 USB 시리얼 통신 연결 완료!', 'success');
            
        } catch (err) {
            log(`USB 연결 실패: ${err.message}`, 'err');
        }
    });

    // --- Send Command to Hardware ---
    async function sendCommand(joint, value) {
        // 3D 모델은 하드웨어 연결과 무관하게 무조건 업데이트
        update3DModel(joint, value);

        if (!isConnected || !writer) return;
        
        const payload = JSON.stringify({ joint: joint, val: value }) + '\n';
        try {
            await writer.write(payload);
            log(`CMD 송신 > ${payload.trim()}`, 'cmd');
        } catch (err) {
            log(`명령 전송 실패: ${err.message}`, 'err');
        }
    }

    // --- Slider Events ---
    Object.keys(sliders).forEach(key => {
        const slider = sliders[key];
        const display = displays[key];

        // 실시간 드래그 중 UI 및 3D 업데이트
        slider.addEventListener('input', (e) => {
            const val = e.target.value;
            display.textContent = key === 'gripper' ? `${val}%` : `${val}°`;
            update3DModel(key, parseInt(val));
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

    // 보간 애니메이션용 헬퍼 함수
    function lerp(start, end, t) {
        return start * (1 - t) + end * t;
    }

    btnPlaySeq.addEventListener('click', async () => {
        if (sequence.length === 0) {
            log('재생할 시퀀스가 없습니다. 먼저 위치를 저장하세요.', 'err');
            return;
        }
        if (isPlaying) return;

        isPlaying = true;
        log('--- 시퀀스 자동 재생 시작 ---', 'info');

        const duration = 1500; // 스텝당 1.5초
        const steps = 30; // 보간 스텝 수

        for (let i = 0; i < sequence.length; i++) {
            if (!isPlaying) {
                log('재생이 중단되었습니다.', 'err');
                break;
            }
            
            const targetPos = sequence[i];
            log(`Step ${i+1} 이동 중...`, 'info');

            // 현재 슬라이더 값을 시작점으로 사용
            const startPos = {
                base: parseFloat(sliders.base.value),
                shoulder: parseFloat(sliders.shoulder.value),
                elbow: parseFloat(sliders.elbow.value),
                wrist: parseFloat(sliders.wrist.value),
                gripper: parseFloat(sliders.gripper.value)
            };
            
            // 부드러운 애니메이션 (Linear Interpolation)
            for (let step = 1; step <= steps; step++) {
                if (!isPlaying) break;
                const t = step / steps;
                
                Object.keys(targetPos).forEach(key => {
                    const currentVal = lerp(startPos[key], targetPos[key], t);
                    sliders[key].value = currentVal;
                    displays[key].textContent = key === 'gripper' ? `${Math.round(currentVal)}%` : `${Math.round(currentVal)}°`;
                    update3DModel(key, currentVal);
                });
                
                await new Promise(r => setTimeout(r, duration / steps));
            }

            // 최종 도착지 데이터 하드웨어 전송
            Object.keys(targetPos).forEach(key => {
                sendCommand(key, parseInt(targetPos[key]));
            });
            
            // 이동 완료 후 잠깐 대기
            await new Promise(r => setTimeout(r, 500));
        }

        if (isPlaying) {
            log('--- 시퀀스 재생 완료 ---', 'success');
            isPlaying = false;
        }
    });

    // ==========================================
    // 3D 가상 로봇 팔 (Three.js) 초기화 로직
    // ==========================================
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // 카메라
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(15, 15, 20);
    camera.lookAt(0, 5, 0);

    // 렌더러
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // 조명
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // 매터리얼
    const matBase = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const matArm = new THREE.MeshPhongMaterial({ color: 0x888888 });
    const matJoint = new THREE.MeshPhongMaterial({ color: 0x007bff });
    const matGripper = new THREE.MeshPhongMaterial({ color: 0xff7b00 });

    // --- 3D 계층 구조 생성 ---
    
    // 1. Base (회전)
    const baseGroup = new THREE.Group();
    scene.add(baseGroup);
    const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.5, 2, 32), matBase);
    baseMesh.position.y = 1;
    baseGroup.add(baseMesh);

    // 2. Shoulder (어깨)
    const shoulderGroup = new THREE.Group();
    shoulderGroup.position.y = 2; 
    baseGroup.add(shoulderGroup);
    
    const shoulderJoint = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.5, 16), matJoint);
    shoulderJoint.rotation.x = Math.PI / 2;
    shoulderGroup.add(shoulderJoint);
    
    const bicepMesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 6, 1.5), matArm);
    bicepMesh.position.y = 3;
    shoulderGroup.add(bicepMesh);

    // 3. Elbow (팔꿈치)
    const elbowGroup = new THREE.Group();
    elbowGroup.position.y = 6;
    shoulderGroup.add(elbowGroup);
    
    const elbowJoint = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2, 16), matJoint);
    elbowJoint.rotation.x = Math.PI / 2;
    elbowGroup.add(elbowJoint);
    
    const forearmMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5, 1.2), matArm);
    forearmMesh.position.y = 2.5;
    elbowGroup.add(forearmMesh);

    // 4. Wrist (손목)
    const wristGroup = new THREE.Group();
    wristGroup.position.y = 5;
    elbowGroup.add(wristGroup);
    
    const wristJoint = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), matJoint);
    wristGroup.add(wristJoint);

    // 5. Gripper (그리퍼)
    const gripperGroup = new THREE.Group();
    gripperGroup.position.y = 1;
    wristGroup.add(gripperGroup);
    
    const gripperBase = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 1), matGripper);
    gripperGroup.add(gripperBase);

    const jawLeft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.8), matGripper);
    jawLeft.position.set(-1, 1, 0);
    gripperGroup.add(jawLeft);
    
    const jawRight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.8), matGripper);
    jawRight.position.set(1, 1, 0);
    gripperGroup.add(jawRight);

    // 바닥 그리드
    const gridHelper = new THREE.GridHelper(30, 30, 0x444444, 0x222222);
    scene.add(gridHelper);

    // 렌더링 루프
    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }
    animate();

    // 창 크기 조절 대응
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    // 3D 모델 실시간 업데이트 함수
    function update3DModel(joint, value) {
        const deg2rad = Math.PI / 180;
        // 슬라이더 0~180을 각도로 변환 (90도가 중앙 기준 0도)
        const angle = (value - 90) * deg2rad;
        
        switch(joint) {
            case 'base':
                baseGroup.rotation.y = -angle; 
                break;
            case 'shoulder':
                shoulderGroup.rotation.z = -angle; 
                break;
            case 'elbow':
                elbowGroup.rotation.z = -angle; 
                break;
            case 'wrist':
                wristGroup.rotation.x = angle; 
                break;
            case 'gripper':
                // 0~100% -> 입 여는 거리 (0.3 ~ 1.2)
                const offset = 0.3 + (value / 100) * 0.9;
                jawLeft.position.x = -offset;
                jawRight.position.x = offset;
                break;
        }
    }

    // 초기 상태 반영
    Object.keys(sliders).forEach(key => {
        update3DModel(key, sliders[key].value);
    });

    log('시스템이 준비되었습니다. 우측 상단의 [USB 연결하기] 버튼을 눌러 Pico를 연결하세요.', 'system');
});
