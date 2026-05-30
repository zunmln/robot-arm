document.addEventListener('DOMContentLoaded', () => {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const statusBadge = document.getElementById('statusBadge');
    const consoleOutput = document.getElementById('consoleOutput');
    const btnConnectUSB = document.getElementById('btnConnectUSB');
    
    const valRoll = document.getElementById('valRoll');
    const valPitch = document.getElementById('valPitch');

    let isConnected = false;
    let port;
    let reader;

    function log(message, type = 'info') {
        const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
        const div = document.createElement('div');
        div.className = `log ${type}`;
        div.textContent = `[${time}] ${message}`;
        consoleOutput.appendChild(div);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
        // 로그가 너무 많아지면 오래된 것 삭제
        while (consoleOutput.children.length > 200) {
            consoleOutput.removeChild(consoleOutput.firstChild);
        }
    }

    // --- Web Serial API Connection ---
    btnConnectUSB.addEventListener('click', async () => {
        try {
            if (!navigator.serial) {
                log('Web Serial 미지원 브라우저입니다. Chrome 또는 Edge를 사용해주세요.', 'err');
                return;
            }
            port = await navigator.serial.requestPort();
            await port.open({ baudRate: 115200 });
            
            // ⚠️ DTR/RTS 신호를 보내지 않습니다!
            // Pico MicroPython은 DTR 신호를 받으면 소프트 리셋되어
            // "The device has been lost" 에러가 발생합니다.
            
            isConnected = true;
            statusDot.classList.remove('offline');
            statusDot.classList.add('online');
            statusBadge.classList.remove('offline');
            statusBadge.classList.add('online');
            statusText.textContent = '통신 중';
            btnConnectUSB.style.display = 'none';
            log('Pico USB 시리얼 연결 성공', 'success');
            
            readLoop();
        } catch (err) {
            log(`연결 실패: ${err.message}`, 'err');
        }
    });

    async function readLoop() {
        const decoder = new TextDecoder();
        let buffer = '';

        while (port.readable) {
            reader = port.readable.getReader();
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) {
                        log('포트가 닫혔습니다.', 'system');
                        break;
                    }

                    const chunk = decoder.decode(value, { stream: true });
                    buffer += chunk;

                    let lines = buffer.split('\n');
                    buffer = lines.pop();

                    for (let line of lines) {
                        line = line.trim();
                        if (!line) continue;

                        try {
                            const data = JSON.parse(line);
                            if (data.roll !== undefined && data.pitch !== undefined) {
                                handleSensorData(data.roll, data.pitch);
                            } else {
                                log(`데이터 수신: ${line}`, 'system');
                            }
                        } catch (e) {
                            if (line.includes('Error') || line.includes('Traceback')) {
                                log(`Pico 에러: ${line}`, 'err');
                            } else {
                                log(`수신: ${line}`, 'system');
                            }
                        }
                    }
                }
            } catch (error) {
                log(`통신 에러: ${error.message}`, 'err');
            } finally {
                reader.releaseLock();
            }
        }
    }

    // 타겟 각도
    let targetRoll = 0;
    let targetPitch = 0;

    function handleSensorData(roll, pitch) {
        valRoll.textContent = `${Math.round(roll)}°`;
        valPitch.textContent = `${Math.round(pitch)}°`;
        targetRoll = roll;
        targetPitch = pitch;
    }

    // ==========================================
    // 3D 로봇 팔 (Three.js)
    // ==========================================
    const container = document.getElementById('canvas-container');
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(14, 12, 18);
    camera.lookAt(0, 5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // 조명
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(8, 20, 12);
    dirLight.castShadow = true;
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xe8f0fe, 0.3);
    fillLight.position.set(-10, 5, -5);
    scene.add(fillLight);

    // 머티리얼 (구글 블루/그레이 톤)
    const matBase = new THREE.MeshStandardMaterial({ color: 0x5f6368, roughness: 0.4, metalness: 0.6 });
    const matArm = new THREE.MeshStandardMaterial({ color: 0xdadce0, roughness: 0.3, metalness: 0.5 });
    const matJoint = new THREE.MeshStandardMaterial({ color: 0x1a73e8, roughness: 0.25, metalness: 0.7 });
    const matGripper = new THREE.MeshStandardMaterial({ color: 0x1e8e3e, roughness: 0.3, metalness: 0.5 });

    // Base
    const baseGroup = new THREE.Group();
    scene.add(baseGroup);
    const baseMesh = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 1.8, 32), matBase);
    baseMesh.position.y = 0.9;
    baseMesh.receiveShadow = true;
    baseGroup.add(baseMesh);

    // Shoulder
    const shoulderGroup = new THREE.Group();
    shoulderGroup.position.y = 1.8;
    baseGroup.add(shoulderGroup);
    
    const shoulderJoint = new THREE.Mesh(new THREE.SphereGeometry(1.3, 32, 32), matJoint);
    shoulderGroup.add(shoulderJoint);
    
    const bicepMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 5.5, 32), matArm);
    bicepMesh.position.y = 2.75;
    bicepMesh.castShadow = true;
    shoulderGroup.add(bicepMesh);

    // Elbow
    const elbowGroup = new THREE.Group();
    elbowGroup.position.y = 5.5;
    shoulderGroup.add(elbowGroup);
    
    const elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(1.0, 32, 32), matJoint);
    elbowGroup.add(elbowJoint);
    
    const forearmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 4.5, 32), matArm);
    forearmMesh.position.y = 2.25;
    forearmMesh.castShadow = true;
    elbowGroup.add(forearmMesh);

    // Gripper
    const gripperGroup = new THREE.Group();
    gripperGroup.position.y = 4.5;
    elbowGroup.add(gripperGroup);
    
    const wristJoint = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 32), matJoint);
    gripperGroup.add(wristJoint);

    const gripperMesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.8), matGripper);
    gripperMesh.position.y = 1;
    gripperGroup.add(gripperMesh);

    const jawL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.2, 0.7), matGripper);
    jawL.position.set(-0.9, 1.7, 0);
    gripperGroup.add(jawL);
    const jawR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.2, 0.7), matGripper);
    jawR.position.set(0.9, 1.7, 0);
    gripperGroup.add(jawR);

    // 바닥 그리드
    const gridHelper = new THREE.GridHelper(30, 30, 0xdadce0, 0xf1f3f4);
    scene.add(gridHelper);

    // 보간용 현재 각도
    let currentRoll = 0;
    let currentPitch = 0;
    
    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    // 렌더링 루프
    function animate() {
        requestAnimationFrame(animate);
        
        currentRoll = lerp(currentRoll, targetRoll, 0.08);
        currentPitch = lerp(currentPitch, targetPitch, 0.08);

        // Roll -> Base 좌우 회전
        baseGroup.rotation.y = -(currentRoll * Math.PI / 180);
        
        // Pitch -> Shoulder + Elbow 연동
        const pRad = currentPitch * Math.PI / 180;
        shoulderGroup.rotation.z = -pRad * 0.7;
        elbowGroup.rotation.z = -pRad * 0.5;

        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        if (!container.clientWidth || !container.clientHeight) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
});
