// ---- BUILD VERSION CONTROLLER ----
const BUILD_NUMBER = "3"; // <-- Increment this number whenever you commit!

// Dom Elements
const editor = document.getElementById('editor');
const consoleBox = document.getElementById('console');
const btnSave = document.getElementById('btn-save');
const fileLoad = document.getElementById('file-load');
const btnPreview = document.getElementById('btn-preview');
const btnExport = document.getElementById('btn-export');
const viewer3d = document.getElementById('3d-viewer');
const placeholderText = document.getElementById('placeholder-text');

// Store the FACTORY engine globally instead of a single-use instance
let openSCADFactory = null;
let currentStlBlob = null; // Stores the rendered STL for exporting

// Helper to log to our UI console
function logToConsole(message) {
    consoleBox.textContent += `\n${message}`;
    consoleBox.scrollTop = consoleBox.scrollHeight; // Auto scroll to bottom
}

// ---- FILE OPERATIONS (.scad) ----

// Save local .scad file
btnSave.addEventListener('click', () => {
    const code = editor.value;
    const blob = new Blob([code], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'model.scad';
    link.click();
    logToConsole('Saved model.scad successfully.');
});

// Load local .scad file
fileLoad.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        editor.value = e.target.result;
        logToConsole(`Loaded file: ${file.name}`);
    };
    reader.readAsText(file);
});


// ---- OPENSCAD WASM FACTORY PREPARATION ----

async function initOpenSCAD() {
    logToConsole(`Build Version: v${BUILD_NUMBER}`);
    logToConsole('Loading browser-optimized OpenSCAD module...');
    try {
        const OpenSCADModule = await import('https://code4fukui.github.io/scad2stl/openscad.js');
        
        openSCADFactory = OpenSCADModule.default || OpenSCADModule.createOpenSCAD || OpenSCADModule;
        
        if (typeof openSCADFactory !== 'function') {
            throw new Error("OpenSCAD factory interface could not be resolved.");
        }

        logToConsole('OpenSCAD Engine ready! Alter code and click Preview freely.');
        btnPreview.disabled = false;
    } catch (err) {
        logToConsole(`Failed to initialize OpenSCAD: ${err.message}`);
        console.error(err);
    }
}


// ---- THE PREVIEW TRIGGER (F5 Style) ----

btnPreview.addEventListener('click', async () => {
    if (!openSCADFactory) {
        logToConsole('Error: OpenSCAD engine factory is not loaded yet.');
        return;
    }

    logToConsole('--- Generating Preview ---');
    const scriptCode = editor.value;
    
    // Clean array to collect logs for parsing later
    const errorLogs = [];

    try {
        logToConsole('Spawning fresh WASM runtime sandbox...');
        
        const instance = await new Promise((resolve, reject) => {
            try {
                const inst = openSCADFactory({
                    noInitialRun: true,
                    print: (text) => logToConsole(`[OpenSCAD]: ${text}`),
                    printErr: (text) => {
                        logToConsole(`[ERROR]: ${text}`);
                        errorLogs.push(text); // Collect error lines safely
                    },
                    onRuntimeInitialized: () => resolve(inst)
                });

                if (inst && typeof inst.then === 'function') {
                    inst.then(resolve).catch(reject);
                }
            } catch (initError) {
                reject(initError);
            }
        });

        if (!instance || !instance.FS) {
            throw new Error("Failed to initialize virtual filesystem mapping on runtime spawn.");
        }

        // 1. Write the user's code into the fresh instance's virtual memory
        instance.FS.writeFile('/input.scad', scriptCode);
        logToConsole('Code loaded into virtual memory.');

        // 2. Execute OpenSCAD compilation
        logToConsole('Compiling geometry via WASM...');
        instance.callMain(['/input.scad', '-o', '/output.stl']);
        
        // 3. Verify output creation
        if (instance.FS.analyzePath('/output.stl').exists) {
            logToConsole('SUCCESS: 3D Mesh computed.');

            // 4. Read the raw binary STL data out of virtual memory
            const stlData = instance.FS.readFile('/output.stl');

            // 5. Convert raw bytes to browser object URL
            currentStlBlob = new Blob([stlData], { type: 'application/sla' });
            const blobUrl = URL.createObjectURL(currentStlBlob);
            
            // 6. PASS DATA TO OUR NEW THREE.JS INJECTION PIPELINE HANDLER
            update3DModelViewer(blobUrl);
            
            // 7. Hide overlay placeholder notifications
            placeholderText.style.display = 'none';
            
            logToConsole('3D View updated successfully.');
            btnExport.disabled = false;
        } else {
            logToConsole('ERROR: output.stl was not created. Check error stack above.');
            
            // Look through collected logs to find a line number
            let detectedErrorLine = null;
            for (const logLine of errorLogs) {
                const lineMatch = logLine.match(/line\s+(\d+)/i);
                if (lineMatch) {
                    detectedErrorLine = parseInt(lineMatch[1], 10);
                    break; // Use the first syntax error location found
                }
            }

            if (detectedErrorLine) {
                highlightEditorLine(detectedErrorLine);
            }
        }

    } catch (error) {
        logToConsole(`Execution error: ${error.message || error}`);
        console.error(error);
    }
});

// Helper function to handle text calculations and highlight the line
function highlightEditorLine(lineNumber) {
    const text = editor.value;
    const lines = text.split('\n');
    
    let targetLine = lineNumber;
    
    // COMPILER OFFSET ADJUSTMENT
    // If the parser complains about a line that is just an end brace, 
    // the missing semicolon is almost certainly on the line above it.
    if (targetLine > 1 && lines[targetLine - 1].trim() === '}') {
        targetLine--; 
    }

    // Safety fallback bounds check
    if (targetLine > lines.length) targetLine = lines.length;

    // Sum up character indexes to find the starting and ending string offsets
    let startPos = 0;
    for (let i = 0; i < targetLine - 1; i++) {
        startPos += lines[i].length + 1; // +1 handles the original newline char (\n)
    }
    const endPos = startPos + lines[targetLine - 1].length;

    // Pull focus to text box and visually highlight the text range
    editor.focus();
    editor.setSelectionRange(startPos, endPos);
    
    logToConsole(`👉 Highlighted suspected syntax break near Line ${targetLine}.`);
}


// ---- THE EXPORT TRIGGER (Save STL) ----

btnExport.addEventListener('click', () => {
    if (!currentStlBlob) {
        logToConsole('Nothing to export. Run Preview first.');
        return;
    }
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(currentStlBlob);
    link.download = 'openscad_model.stl';
    link.click();
    logToConsole('Exported openscad_model.stl successfully.');
});


// ---- SERVICE WORKER REGISTRATION ----

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered successfully!', reg.scope))
            .catch(err => console.log('Service Worker registration failed:', err));
    });
}

// Start preparation workflows
btnPreview.disabled = true;
btnExport.disabled = true;
initOpenSCAD();

// ---- THE THREE.JS STL WORKSPACE VIEWPORT ENGINE ----

let scene, camera, renderer, controls, currentMesh = null;

function init3DWorkspace() {
    const container = document.getElementById('3d-viewer');
    if (!container) return;

    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    // 2. Camera Viewport Calculation
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(30, 30, 40);

    // 3. WebGL Canvas Core Renderer Mounting
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Force an immediate layout pass calculation on startup
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    
    // 4. Mouse Orbit Controls Integration
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // 5. Dual Lighting Environment Setup
    const ambientLight = new THREE.AmbientLight(0x666666);
    scene.add(ambientLight);

    // ---- SANITY CHECK: INJECT RAW TEST GEOMETRY ----
    const testGeometry = new THREE.BoxGeometry(10, 10, 10);
    const testMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x00ff00, // Bright green neon box
        roughness: 0.2 
    });
    const testBox = new THREE.Mesh(testGeometry, testMaterial);
    testBox.position.set(0, 0, 0);
    scene.add(testBox);
    console.log("[Sanity Check]: Core green box added to workspace frame.");
    // ------------------------------------------------
    
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(1, 1, 1).normalize();
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x555555, 0.5);
    dirLight2.position.set(-1, -1, -1).normalize();
    scene.add(dirLight2);

    // 6. Window Resize Auto Tracker
    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    // Start looping rendering frame animations
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();
}

// Global invocation hook to feed new Binary data layouts into our canvas space
function update3DModelViewer(blobUrl) {
    if (!scene) {
        init3DWorkspace(); // Lazily builds scene workspace environment frames on first render pass
    }

    // Clear old geometry out of GPU registers
    if (currentMesh) {
        scene.remove(currentMesh);
        currentMesh.geometry.dispose();
        currentMesh.material.dispose();
        currentMesh = null;
    }

    const loader = new THREE.STLLoader();
    loader.load(blobUrl, (geometry) => {
        // 1. Force recalculation of surface normals so light interacts with faces correctly
        geometry.computeVertexNormals();
        
        // 2. High-contrast material styling so it stands out against dark backgrounds
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x3b82f6,      // Vibrant blue mesh
            roughness: 0.3,
            metalness: 0.1,
            roughnessMap: null    // Ensure no fallback bugs affect rendering
        });
        
        currentMesh = new THREE.Mesh(geometry, material);
        
        // 3. Compute accurate bounding boxes
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        
        const center = new THREE.Vector3();
        geometry.boundingBox.getCenter(center);
        
        // Offset the mesh position so its absolute physical core rests at world coordinates [0, 0, 0]
        currentMesh.position.set(-center.x, -center.y, -center.z);

        scene.add(currentMesh);
        
        // 4. DYNAMIC CAMERA FRAMING
        const radius = geometry.boundingSphere.radius;
        
        // Fallback safety if radius calculates to 0 or fails
        const targetDistance = radius > 0 ? radius * 3.5 : 50; 

        // Reposition camera dynamically based on the calculated size scale
        camera.position.set(targetDistance, targetDistance, targetDistance);
        
        // Reset orbit controls behavior to orbit cleanly around world origin [0,0,0]
        controls.target.set(0, 0, 0);
        camera.lookAt(0, 0, 0);
        
        controls.update();
        console.log(`[Viewer]: Mesh rendered successfully. Bounding radius: ${radius}`);
    }, undefined, (err) => {
        console.error('[Viewer Error]: Failed to read raw STL bytes:', err);
    });
}
