document.addEventListener('DOMContentLoaded', () => {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const consoleOutput = document.getElementById('consoleOutput');
    const btnConnectUSB = document.getElementById('btnConnectUSB');
    
    const valRoll = document.getElementById('valRoll');
    const valPitch = document.getElementById('valPitch');

    let isConnected = false;
    let port;
    let reader;

    function log(message, type = 'info') {
        const div = document.createElement('div');
        div.className = `log ${type}`;
        div.textContent = `> ${message}`;
        consoleOutput.appendChild(div);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }

    // --- Web Serial API Connection (Read mode) ---
    btnConnectUSB.addEventListener('click', async () => {
        try {
            if (!navigator.serial) {
                log('크롬이나 엣지 브라우저를 사용해줘!', 'err');
                return;
            }
            port = await navigator.serial.requestPort();
            await port.open({ baudRate: 115200 });
            
            // Pico 등 일부 보드는 시리얼 포트 오픈 시 명시적인 DTR/RTS 신호가 필요할 수 있습니다.
            await port.setSignals({ dataTerminalReady: true, requestToSend: true });
            
            isConnected = true;
            statusDot.classList.remove('offline');
            statusDot.classList.add('online');
            statusText.textContent = 'Pico 통신 중... ✨';
            btnConnectUSB.style.display = 'none';
            log('Pico와 뽀용뽀용하게 연결 완료!', 'success');
            
            readLoop();
        } catch (err) {
            log(`연결 실패: ${err.message}`, 'err');
        }
    });

    async function readLoop() {
        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
        reader = textDecoder.readable.getReader();

        let buffer = '';

        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                buffer += value;
                let lines = buffer.split('\n');
                buffer = lines.pop(); // 불완전한 마지막 줄은 버퍼에 남김
                
                for (let line of lines) {
                    line = line.trim();
                    if (!line) continue;
                    try {
                        const data = JSON.parse(line);
                        if (data.roll !== undefined && data.pitch !== undefined) {
                            handleSensorData(data.roll, data.pitch);
                        } else {
                            log(`수신됨 (포맷 다름): ${line}`, 'system');
                        }
                    } catch (e) {
                        // Thonny REPL 메시지나 에러 로그가 들어올 경우 화면에 표시
                        if (line.includes("Error") || line.includes("Traceback")) {
                            log(`Pico 에러: ${line}`, 'err');
                        } else {
                            log(`수신된 텍스트: ${line}`, 'system');
                        }
                    }
                }
            }
        } catch (error) {
            log('통신이 끊겼어 ㅠㅠ', 'err');
        } finally {
            reader.releaseLock();
        }
    }

    // 타겟(목표) 각도
    let targetRoll = 0;
    let targetPitch = 0;

    function handleSensorData(roll, pitch) {
        valRoll.textContent = `${Math.round(roll)}°`;
        valPitch.textContent = `${Math.round(pitch)}°`;
        targetRoll = roll;
        targetPitch = pitch;
    }

    // ==========================================
    // 3D 가상 로봇 팔 (Three.js) 초기화 로직
    // ==========================================
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();

    // 카메라
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(15, 15, 20);
    camera.lookAt(0, 5, 0);

    // 렌더러
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0); // 배경 투명하게 (CSS 그라데이션 보임)
    container.appendChild(renderer.domElement);

    // 조명 (화사하게)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffdfba, 0.6);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // 뽀용뽀용 매터리얼 (장난감 같은 파스텔톤 컬러)
    const matBase = new THREE.MeshPhongMaterial({ color: 0xa3c4f3 });
    const matArm1 = new THREE.MeshPhongMaterial({ color: 0xffcbf2 });
    const matArm2 = new THREE.MeshPhongMaterial({ color: 0xfcf6bd });
    const matJoint = new THREE.MeshPhongMaterial({ color: 0xffb5a7 });
    const matGripper = new THREE.MeshPhongMaterial({ color: 0xd0f4de });

    // --- 3D 계층 구조 생성 ---
    
    // 1. Base (좌우 회전)
    const baseGroup = new THREE.Group();
    scene.add(baseGroup);
    const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.5, 2, 32), matBase);
    baseMesh.position.y = 1;
    baseGroup.add(baseMesh);

    // 2. Shoulder (어깨)
    const shoulderGroup = new THREE.Group();
    shoulderGroup.position.y = 2; 
    baseGroup.add(shoulderGroup);
    
    const shoulderJoint = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 32), matJoint);
    shoulderGroup.add(shoulderJoint);
    
    const bicepMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 5, 32), matArm1);
    bicepMesh.position.y = 2.5;
    shoulderGroup.add(bicepMesh);

    // 3. Elbow (팔꿈치)
    const elbowGroup = new THREE.Group();
    elbowGroup.position.y = 5;
    shoulderGroup.add(elbowGroup);
    
    const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(1.2, 32, 32), matJoint);
    elbowGroup.add(elbowJoint);
    
    const forearmMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 4, 32), matArm2);
    forearmMesh.position.y = 2;
    elbowGroup.add(forearmMesh);

    // 4. Gripper (그리퍼)
    const gripperGroup = new THREE.Group();
    gripperGroup.position.y = 4;
    elbowGroup.add(gripperGroup);
    
    const wristJoint = new THREE.Mesh(new THREE.SphereGeometry(1.0, 32, 32), matJoint);
    gripperGroup.add(wristJoint);

    // 귀여운 둥근 그리퍼
    const gripperMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1, 32), matGripper);
    gripperMesh.position.y = 1;
    gripperMesh.rotation.x = Math.PI / 2;
    gripperGroup.add(gripperMesh);

    // 바닥 그리드 (귀엽게 연한 색상)
    const gridHelper = new THREE.GridHelper(30, 30, 0xffcbf2, 0xf8edeb);
    scene.add(gridHelper);

    // 보간용 현재 각도
    let currentRoll = 0;
    let currentPitch = 0;
    
    function lerp(start, end, amt) {
        return (1 - amt) * start + amt * end;
    }

    // 렌더링 루프
    function animate() {
        requestAnimationFrame(animate);
        
        // 스무딩 (Lerp) 적용하여 부드럽게 이동 (센서 튀는 현상 방지)
        currentRoll = lerp(currentRoll, targetRoll, 0.1);
        currentPitch = lerp(currentPitch, targetPitch, 0.1);

        // 매핑: Roll -> Base 좌우 회전 (Y축)
        baseGroup.rotation.y = -(currentRoll * Math.PI / 180);
        
        // 매핑: Pitch -> 어깨와 팔꿈치 연동 (Z축)
        const pRad = currentPitch * Math.PI / 180;
        shoulderGroup.rotation.z = -pRad * 0.8; 
        elbowGroup.rotation.z = -pRad * 0.5; // 팔꿈치도 연동되어 같이 굽혀짐

        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
});
