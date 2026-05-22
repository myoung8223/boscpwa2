// ---- BUILD VERSION CONTROLLER ----
const BUILD_NUMBER = "9"; // <-- Increment this number whenever you commit!

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

// ---- THE THREE.JS STL WORKSPACE VIEWPORT ENGINE ----

let scene, camera, renderer, controls, currentMesh = null;
let workspaceInitialized = false;

function init3DWorkspace() {
    if (workspaceInitialized) return; // Prevent double-booting
    workspaceInitialized = true;

    const container = document.getElementById('3d-viewer');
    if (!container) return;

    // MATH SAFEGUARD: Never allow a 0px dimension to touch the camera matrix
    const w = container.clientWidth || 500;
    const h = container.clientHeight || 500;

    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    // 2. Camera Viewport Calculation (Protected against Infinity)
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10000);
    camera.position.set(40, 40, 40);

    // 3. WebGL Canvas Core Renderer Mounting
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio); // Forces crisp rendering on high-res displays
    container.appendChild(renderer.domElement);

    // 4. Mouse Orbit Controls Integration
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(0, 0, 0);

    /*
    // ---- SANITY CHECK: INJECT RAINBOW TEST GEOMETRY ----
    const testGeometry = new THREE.BoxGeometry(10, 10, 10);
    // MeshNormalMaterial is completely immune to lighting and always renders bright neon colors
    const testMaterial = new THREE.MeshNormalMaterial({ wireframe: true }); 
    const testBox = new THREE.Mesh(testGeometry, testMaterial);
    scene.add(testBox);
    console.log("[Sanity Check]: Rainbow wireframe box added to workspace.");
    // ---------------------------------------------------
    */

    // 5. Lighting Environment Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(50, 50, 50);
    scene.add(dirLight1);

    // 6. Robust Animation Loop with Live Layout Boundary Matching
    function animate() {
        requestAnimationFrame(animate);
        
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        
        // Get current pixel size of the WebGL rendering surface
        const currentSize = new THREE.Vector2();
        renderer.getSize(currentSize);
        
        // Force update if the layout panel size shifts away from our rendering size
        if (cw > 0 && ch > 0 && (currentSize.x !== cw || currentSize.y !== ch)) {
            camera.aspect = cw / ch;
            camera.updateProjectionMatrix();
            renderer.setSize(cw, ch, true); // Setting this to true forces canvas element geometry changes
            console.log(`[Viewport Fixed]: Canvas adjusted to match panel bounds: ${cw}x${ch}`);
        }

        controls.update();
        renderer.render(scene, camera);
    }
    animate();
}

// Global invocation hook for OpenSCAD preview button
function update3DModelViewer(blobUrl) {
    if (!workspaceInitialized) init3DWorkspace(); 

    if (currentMesh) {
        scene.remove(currentMesh);
        currentMesh.geometry.dispose();
        currentMesh.material.dispose();
        currentMesh = null;
    }

    const loader = new THREE.STLLoader();
    loader.load(blobUrl, (geometry) => {
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.3, metalness: 0.1 });
        currentMesh = new THREE.Mesh(geometry, material);
        
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        
        const center = new THREE.Vector3();
        geometry.boundingBox.getCenter(center);
        currentMesh.position.set(-center.x, -center.y, -center.z);

        scene.add(currentMesh);
        
        const radius = geometry.boundingSphere.radius;
        const targetDistance = radius > 0 ? radius * 3.5 : 50; 

        camera.position.set(targetDistance, targetDistance, targetDistance);
        controls.target.set(0, 0, 0);
        camera.lookAt(0, 0, 0);
        controls.update();
        
    }, undefined, (err) => console.error('[Viewer Error]:', err));
}

// ---- BOOTSTRAP APPLICATION ----

// 1. Lock UI buttons until WASM loads
btnPreview.disabled = true;
btnExport.disabled = true;

// 2. Initialize background compiler
initOpenSCAD();

// 3. Boot 3D environment immediately so size caches correctly
init3DWorkspace();
