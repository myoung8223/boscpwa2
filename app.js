// ---- BUILD VERSION CONTROLLER ----
const BUILD_NUMBER = "17"; // <-- Increment this number whenever you commit!

// Dom Elements
const editor = document.getElementById('editor');
const consoleBox = document.getElementById('console');
const btnSave = document.getElementById('btn-save');
const fileLoad = document.getElementById('file-load');
const btnPreview = document.getElementById('btn-preview');
const btnExport = document.getElementById('btn-export');
const viewer3d = document.getElementById('viewer-3d');
const placeholderText = document.getElementById('placeholder-text');
const btnWireframe = document.getElementById('btn-wireframe');

const modelColorInput = document.getElementById('model-color');
// Grab our new button trigger element reference
const btnColorTrigger = document.getElementById('btn-color-trigger');

// ---- PERSISTENT COLOR PREFERENCE INITIALIZATION ----
const savedColorHexStr = localStorage.getItem('openscad_model_color') || '#3b82f6';

if (modelColorInput) {
    modelColorInput.value = savedColorHexStr;
}

// Force the button's background color to show the selected color on load
if (btnColorTrigger) {
    btnColorTrigger.style.background = savedColorHexStr;
}

let activeModelColor = parseInt(savedColorHexStr.replace('#', '0x'), 16);
// ----------------------------------------------------

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

// LocalStorage Continuous Keypress Auto-Save Hook
editor.addEventListener('input', () => {
    localStorage.setItem('openscad_editor_cache', editor.value);
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

// Toggle between Solid and Wireframe viewing modes
btnWireframe.addEventListener('click', () => {
    wireframeMode = !wireframeMode; // true = wireframe, false = solid
    
    // Update labels and colors based on active mode state
    if (wireframeMode) {
        btnWireframe.textContent = 'Wireframe';
        btnWireframe.style.background = '#444';     // Dark gray when in wireframe mode
    } else {
        btnWireframe.textContent = 'Solid';
        btnWireframe.style.background = '#007acc';  // High-visibility blue when in solid mode
    }

    // Live update the viewport mesh instantly if a model is currently on screen
    if (currentMesh && currentMesh.material) {
        currentMesh.material.wireframe = wireframeMode;
    }
});

// Global Application Hotkey Command Mappings
window.addEventListener('keydown', (event) => {
    // Check for [Ctrl + Enter] command match execution
    if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault(); // Stop default paragraph breaks or form issues
        
        if (!btnPreview.disabled) {
            logToConsole('⌨️ Hotkey Triggered: [Ctrl + Enter]');
            btnPreview.click(); // Programmatically execute compiling sequence safely
        }
    }
});

// Route button clicks directly into the hidden native color input element
btnColorTrigger.addEventListener('click', () => {
    modelColorInput.click();
});

// Live update the material color and button preview background when the palette value shifts
modelColorInput.addEventListener('input', (event) => {
    const selectedHex = event.target.value;
    
    localStorage.setItem('openscad_model_color', selectedHex);

    // Update the button's background fill to reflect the active color choice instantly
    btnColorTrigger.style.background = selectedHex;

    activeModelColor = parseInt(selectedHex.replace('#', '0x'), 16);
    
    if (currentMesh && currentMesh.material) {
        currentMesh.material.color.setHex(activeModelColor);
    }
});

// ---- OPENSCAD WASM FACTORY PREPARATION ----

async function initOpenSCAD() {
    logToConsole(`Build Version: v${BUILD_NUMBER}`);
    
    // ---- FEATURE 3: RESTORE PERSISTENT CODE CACHE ----
    const savedCode = localStorage.getItem('openscad_editor_cache');
    if (savedCode && savedCode.trim() !== "") {
        editor.value = savedCode;
        logToConsole('Restored draft layout from your last active session.');
    } else {
        // Fallback default starter geometry if local cache is completely empty
        editor.value = `// Welcome to your Mobile PWA CAD Environment\ncube([10, 15, 20], center=true);\n\ntranslate([0, 0, 15]) {\n    sphere(r=8);\n}`;
        logToConsole('Seeded editor workspace with default starter geometry.');
    }
    // --------------------------------------------------

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
let wireframeMode = false;

function init3DWorkspace() {
    if (workspaceInitialized) return; // Prevent double-booting
    workspaceInitialized = true;

    const container = document.getElementById('viewer-3d');
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

    // ---- 3D WORKSPACE GRID AND ORIGIN AXES ----
    const gridHelper = new THREE.GridHelper(100, 20, 0x007acc, 0x444444);
    // Rotate the grid to lie flat along the OpenSCAD X/Y plane
    //gridHelper.rotation.x = -Math.PI / 2;
    //gridHelper.position.y = -0.01; 
    scene.add(gridHelper);

    // Main origin axes helper (X=Red, Y=Green, Z=Blue)
    const axesHelper = new THREE.AxesHelper(15);
    // Rotate the axes helper so the Blue Z line points straight UP
    axesHelper.rotation.x = -Math.PI / 2;    
    scene.add(axesHelper);

    // ---- FEATURE 2: CORNER NAVIGATION COMPASS GENERATOR ----
    // Create a mini-overlay DOM container programmatically inside the viewer
    const compassContainer = document.createElement('div');
    compassContainer.style.position = 'absolute';
    compassContainer.style.top = '10px';
    compassContainer.style.right = '10px';
    compassContainer.style.width = '80px';
    compassContainer.style.height = '80px';
    compassContainer.style.zIndex = '100';
    compassContainer.style.pointerEvents = 'none'; // Keeps mouse events focused on main view orbit
    container.appendChild(compassContainer);

    // Setup an isolated mini-subscene for the compass
    const compassScene = new THREE.Scene();
    const compassCamera = new THREE.PerspectiveCamera(50, 1, 1, 100);
    
    const compassRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); // Alpha ensures container stays transparent
    compassRenderer.setSize(80, 80);
    compassRenderer.setPixelRatio(window.devicePixelRatio);
    compassContainer.appendChild(compassRenderer.domElement);

    // Create custom color-coded navigation arrows or standard axes line arrays for the corner
    const compassAxes = new THREE.AxesHelper(25);
    // Rotate the corner compass axes to match the viewport alignment perfectly
    compassAxes.rotation.x = -Math.PI / 2;
    compassScene.add(compassAxes);

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
        
        const currentSize = new THREE.Vector2();
        renderer.getSize(currentSize);
        
        if (cw > 0 && ch > 0 && (currentSize.x !== cw || currentSize.y !== ch)) {
            camera.aspect = cw / ch;
            camera.updateProjectionMatrix();
            renderer.setSize(cw, ch, true);
        }

        controls.update();
        renderer.render(scene, camera);

        // --- COMPASS SYNCHRONIZATION MATRIX PASSTHROUGH ---
        if (compassCamera && compassRenderer) {
            // Force the mini camera to sit at an identical layout angle vector relative to the origin
            compassCamera.position.copy(camera.position);
            compassCamera.position.sub(controls.target); // Subtract controls focus target to handle panning
            compassCamera.position.setLength(60); // Constrain tracking orbit distance radius
            compassCamera.lookAt(0, 0, 0);
            
            compassRenderer.render(compassScene, compassCamera);
        }
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
        
        const material = new THREE.MeshStandardMaterial({ 
            color: activeModelColor, // Dynamically uses the persistent color preference!
            roughness: 0.3, 
            metalness: 0.1,
            wireframe: wireframeMode 
        });
        currentMesh = new THREE.Mesh(geometry, material);
        
        // ---- COORDINATE ENGINE FIXED MATRIX CONVERSIONS ----
        // 1. ABSOLUTELY NO AUTO-CENTERING REPOSITIONING. 
        // Keep the model perfectly clamped to its code-defined coordinates.
        currentMesh.position.set(0, 0, 0);

        // 2. SWAP THE COORDINATE MATRIX TO MATCH OPENSCAD Z-UP ARCHITECTURE
        // Rotating -90 degrees (-Math.PI / 2) maps OpenSCAD Z onto Three.js Y
        currentMesh.rotation.x = -Math.PI / 2;

        scene.add(currentMesh);
        // --------------------------------------------------
        
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        
        const radius = geometry.boundingSphere.radius;
        
        // Target dynamic camera zoom distance based on overall model size volume
        const targetDistance = radius > 0 ? radius * 3.5 : 50; 

        // Set an ergonomic initial perspective angle looking down at the origin
        camera.position.set(targetDistance, targetDistance * 1.2, targetDistance);
        controls.target.set(0, 0, 0); // Lock rotation pivot permanently to true [0,0,0] origin
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

btnWireframe.style.background = '#007acc'; // Vibrant active solid blue
