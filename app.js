// ---- BUILD VERSION CONTROLLER ----
const BUILD_NUMBER = "50"; // <-- Increment this number whenever you commit!

// Dom Elements
const editor = document.getElementById('editor');
const consoleBox = document.getElementById('console');
const btnSave = document.getElementById('btn-save');
const fileLoad = document.getElementById('file-load');
const btnPreview = document.getElementById('btn-preview');
const btnExport = document.getElementById('btn-export');
const viewer3d = document.getElementById('viewer-3d');
const btnCameraReset = document.getElementById('btn-camera-reset');
const placeholderText = document.getElementById('placeholder-text');
const btnWireframe = document.getElementById('btn-wireframe');
const projectNameInput = document.getElementById('project-name-input');
const editorFontSizeSelect = document.getElementById('editor-font-size-select');
const modelColorInput = document.getElementById('model-color');
const btnColorTrigger = document.getElementById('btn-color-trigger');

// ---- PERSISTENT PROJECT NAME INITIALIZATION ----
let activeProjectName = localStorage.getItem('openscad_project_name') || 'untitled';

if (projectNameInput) {
    projectNameInput.value = activeProjectName;
}

function updateWindowTitle() {
    document.title = `${activeProjectName}.scad`;
}
updateWindowTitle();

// ---- PERSISTENT FONT SIZE INITIALIZATION ----
const savedFontSizeStr = localStorage.getItem('openscad_editor_font_size') || '14px';

if (editor && editorFontSizeSelect) {
    editor.style.fontSize = savedFontSizeStr;
    editorFontSizeSelect.value = savedFontSizeStr;
}

// ---- PERSISTENT COLOR PREFERENCE INITIALIZATION ----
const savedColorHexStr = localStorage.getItem('openscad_model_color') || '#3b82f6';

if (modelColorInput) {
    modelColorInput.value = savedColorHexStr;
}
if (btnColorTrigger) {
    btnColorTrigger.style.background = savedColorHexStr;
}

let activeModelColor = parseInt(savedColorHexStr.replace('#', '0x'), 16);

// Store the FACTORY engine globally instead of a single-use instance
let openSCADFactory = null;
let currentStlBlob = null; 
const fontCache = {}; 

// Helper to log to our UI console
function logToConsole(message) {
    let cleanMessage = message.replace(/^\[ERROR\]:\s*/gm, '');

    if (cleanMessage.includes("Could not initialize localization") || 
        cleanMessage.includes("Fontconfig error")) {
        return; 
    }

    consoleBox.textContent += `\n${cleanMessage}`;
    consoleBox.scrollTop = consoleBox.scrollHeight; 
}

// ---- FILE OPERATIONS (.scad) ----

// Save local .scad file
btnSave.addEventListener('click', () => {
    const code = editor.value;
    const blob = new Blob([code], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    
    let safeFilename = activeProjectName.trim().replace(/\.scad$/i, '');
    if (!safeFilename) safeFilename = "untitled"; 
    
    link.download = `${safeFilename}.scad`;
    link.click();
    logToConsole(`Saved ${safeFilename}.scad successfully.`);
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

        localStorage.setItem('openscad_editor_cache', editor.value);

        let nameFromDisk = file.name.replace(/\.scad$/i, '');
        activeProjectName = nameFromDisk;
        localStorage.setItem('openscad_project_name', activeProjectName);
        if (projectNameInput) projectNameInput.value = activeProjectName;
        updateWindowTitle();

        if (typeof btnPreview !== 'undefined' && !btnPreview.disabled) {
            logToConsole('Running automatic preview for loaded file...');
            btnPreview.click();
        }
    };
    reader.readAsText(file);
});

// Toggle between Solid and Wireframe viewing modes
btnWireframe.addEventListener('click', () => {
    wireframeMode = !wireframeMode; 
    
    if (wireframeMode) {
        btnWireframe.textContent = 'Wireframe';
        btnWireframe.style.background = '#444';     
    } else {
        btnWireframe.textContent = 'Solid';
        btnWireframe.style.background = '#007acc';  
    }

    if (currentMesh && currentMesh.material) {
        currentMesh.material.wireframe = wireframeMode;
    }
});

// Global Application Hotkey Command Mappings
window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'Enter') {
        event.preventDefault(); 
        
        if (!btnPreview.disabled) {
            logToConsole('⌨️ Hotkey Triggered: [Ctrl + Enter]');
            btnPreview.click(); 
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
    btnColorTrigger.style.background = selectedHex;
    activeModelColor = parseInt(selectedHex.replace('#', '0x'), 16);
    
    if (currentMesh && currentMesh.material) {
        currentMesh.material.color.setHex(activeModelColor);
    }
});

// Smart Symmetrical Indentation Engine: Handles Tab, Shift+Tab, and Multi-line Blocks
editor.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
        event.preventDefault(); 

        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const value = editor.value;
        const isShift = event.shiftKey; 

        if (start === end) {
            if (!isShift) {
                editor.value = value.substring(0, start) + "\t" + value.substring(end);
                editor.selectionStart = editor.selectionEnd = start + 1;
            } else {
                const lineStartPos = value.lastIndexOf('\n', start - 1) + 1;
                
                if (value.startsWith('\t', lineStartPos)) {
                    editor.value = value.substring(0, lineStartPos) + value.substring(lineStartPos + 1);
                    editor.selectionStart = editor.selectionEnd = Math.max(lineStartPos, start - 1);
                } else if (value.substring(lineStartPos, lineStartPos + 4) === "    ") {
                    editor.value = value.substring(0, lineStartPos) + value.substring(lineStartPos + 4);
                    editor.selectionStart = editor.selectionEnd = Math.max(lineStartPos, start - 4);
                }
            }
        } 
        else {
            const selectStartLineStart = value.lastIndexOf('\n', start - 1) + 1;
            const selectEndLineEnd = value.indexOf('\n', end);
            const finalEndPos = selectEndLineEnd === -1 ? value.length : selectEndLineEnd;

            const targetBlock = value.substring(selectStartLineStart, finalEndPos);
            let modifiedBlock = "";
            let charsChangedCount = 0;

            if (!isShift) {
                modifiedBlock = targetBlock.split('\n').map(line => '\t' + line).join('\n');
                charsChangedCount = modifiedBlock.length - targetBlock.length;
            } else {
                modifiedBlock = targetBlock.split('\n').map(line => {
                    if (line.startsWith('\t')) {
                        return line.substring(1); 
                    } else if (line.startsWith('    ')) {
                        return line.substring(4); 
                    }
                    return line; 
                }).join('\n');
                charsChangedCount = modifiedBlock.length - targetBlock.length;
            }

            editor.value = value.substring(0, selectStartLineStart) + modifiedBlock + value.substring(finalEndPos);
            editor.selectionStart = selectStartLineStart;
            editor.selectionEnd = finalEndPos + charsChangedCount;
        }
    }
});

async function initOpenSCAD() {
    // Clear out the console box completely before writing our clean layout
    //consoleBox.textContent = "";
    
    //logToConsole('Basic OpenSCAD PWA - By: Mike Young');
    logToConsole(`Build ${BUILD_NUMBER} - May 22, 2026`);
    logToConsole('System ready. Instantiating WASM...');
    
    // Restore persistent code cache
    const savedCode = localStorage.getItem('openscad_editor_cache');
    if (savedCode && savedCode.trim() !== "") {
        editor.value = savedCode;
        logToConsole('Restored draft layout from your last active session.');
    } else {
        //editor.value = `// Welcome to your Mobile PWA CAD Environment\ncube([10, 15, 20], center=true);\n\ntranslate([0, 0, 15]) {\n    sphere(r=8);\n}`;
        //editor.value = `linear_extrude(height = 4) {\n    text(\n        text = "Hello, world!", \n        size = 14, \n        font = "Liberation Sans:style=Bold", \n        halign = "center", \n        valign = "center"\n    );\n}`;
        editor.value = `linear_extrude(height = 4) {\n\ttext(\n\t\ttext = "Hello, world!", \n\t\tsize = 14, \n\t\tfont = "Liberation Sans:style=Bold", \n\t\thalign = "center", \n\t\tvalign = "center"\n\t);\n}`;
        logToConsole('Seeded editor workspace with default starter geometry.');
    }

    logToConsole('Loading browser-optimized OpenSCAD module...');
    try {
        //const OpenSCADModule = await import('https://code4fukui.github.io/scad2stl/openscad.js');
        const OpenSCADModule = await import('./libs/openscad.js');
        
        openSCADFactory = OpenSCADModule.default || OpenSCADModule.createOpenSCAD || OpenSCADModule;
        if (typeof openSCADFactory !== 'function') {
            throw new Error("OpenSCAD factory interface could not be resolved.");
        }

        // Initialize the factory to ensure it's cached in the browser
        await openSCADFactory();
        
        logToConsole('Loading typography packages from local repository...');
        
        const fontFiles = [
            'LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf', 'LiberationSans-Italic.ttf', 'LiberationSans-BoldItalic.ttf',
            'LiberationMono-Regular.ttf', 'LiberationMono-Bold.ttf', 'LiberationMono-Italic.ttf', 'LiberationMono-BoldItalic.ttf',
            'LiberationSerif-Regular.ttf', 'LiberationSerif-Bold.ttf', 'LiberationSerif-Italic.ttf', 'LiberationSerif-BoldItalic.ttf'
        ];

        // Download fonts and store the raw bytes directly into JS memory
        for (const fontName of fontFiles) {
            try {
                const fontUrl = `./fonts/${fontName}`;
                const response = await fetch(fontUrl);
                
                if (!response.ok) {
                    logToConsole(`⚠️ Skipping font: Could not pull ${fontName} from host.`);
                    continue;
                }
                
                const arrayBuffer = await response.arrayBuffer();
                const fontData = new Uint8Array(arrayBuffer);
                
                // STORE IN THE BACKPACK
                fontCache[fontName] = fontData;
                
                logToConsole(`✔ Cached ${fontName} in memory (${fontData.byteLength} bytes)`);
            } catch (fontErr) {
                console.error(`Error processing font asset "${fontName}":`, fontErr);
            }
        }
        
        logToConsole('✅ Typography suite successfully cached in global memory!');
        logToConsole('OpenSCAD Engine ready! Alter code and click Preview freely.');

        // 1. Enable the button for the user
        btnPreview.disabled = false;
        
        // ---- 2. TRIGGER THE AUTOMATIC FIRST-RUN PREVIEW ----
        logToConsole('Running initial boot preview...');
        btnPreview.click();
        
    } catch (err) {
        logToConsole(`Failed to initialize OpenSCAD: ${err.message}`);
        console.error(err);
    }
}


// ---- THE PREVIEW TRIGGER (F5 Style) ----

// ---- THE PREVIEW TRIGGER (F5 Style) ----

btnPreview.addEventListener('click', async () => {
    if (!openSCADFactory) {
        logToConsole('Error: OpenSCAD engine factory is not loaded yet.');
        return;
    }

    logToConsole('--- Generating Preview ---');
    const scriptCode = editor.value;
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
                        errorLogs.push(text);
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

        // --- NEW: UNPACK THE FONTS INTO THE FRESH SANDBOX ---
        try { instance.FS.mkdir('/fonts'); } catch(e) { /* ignore */ }
        
        for (const [fontName, fontData] of Object.entries(fontCache)) {
            // Write to both paths for guaranteed discovery
            instance.FS.writeFile(`/${fontName}`, fontData);
            instance.FS.writeFile(`/fonts/${fontName}`, fontData);
            
            if (instance.fonts && typeof instance.fonts.registerFont === 'function') {
                instance.fonts.registerFont(`/${fontName}`);
                instance.fonts.registerFont(`/fonts/${fontName}`);
            }
        }
        
        if (instance.ENV) {
            instance.ENV.OPENSCAD_FONTDIR = '/fonts';
        }
        logToConsole('Typography injected into fresh compilation sandbox.');
        // ----------------------------------------------------

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
            
            let detectedErrorLine = null;
            for (const logLine of errorLogs) {
                const lineMatch = logLine.match(/line\s+(\d+)/i);
                if (lineMatch) {
                    detectedErrorLine = parseInt(lineMatch[1], 10);
                    break;
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
    // Size 400 with 40 divisions creates perfect 10mm grid cells across a 400x400mm bed
    const gridHelper = new THREE.GridHelper(400, 40, 0x007acc, 0x444444);
    // Push it down just a tiny hair so models sitting perfectly at Z=0 don't Z-fight with the lines
    gridHelper.position.y = -0.05; 
    scene.add(gridHelper);

    // Main origin axes helper scaled up to 50mm long so it's clearly visible on the large bed
    const axesHelper = new THREE.AxesHelper(50);
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

    /*
    // 5. Lighting Environment Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(50, 50, 50);
    scene.add(dirLight1);
    */

    // ---- UPGRADED: THREE-POINT STUDIO LIGHTING SYSTEM ----
    // 1. Low Ambient Light: Keeps shadows from being pitch black, but doesn't wash out details
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    scene.add(ambientLight);

    // 2. Primary Key Light: Strong white light hitting the model from the front-top-right
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
    keyLight.position.set(100, 150, 50);
    scene.add(keyLight);

    // 3. Secondary Fill Light: Softer, warmer light from the opposite side to soften harsh shadow edges
    const fillLight = new THREE.DirectionalLight(0xeeeeff, 0.4);
    fillLight.position.set(-100, 80, -50);
    scene.add(fillLight);

    // 4. Rim/Top Light: Placed straight above pointing down to crisp up top edges and embossing
    const topLight = new THREE.DirectionalLight(0xffffff, 0.3);
    topLight.position.set(0, 200, 0);
    scene.add(topLight);
    
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

    // ---- STEP 1: CAPTURE CURRENT VIEW STATE BEFORE WIPING SCENE ----
    let savedPosition = null;
    let savedTarget = null;
    
    // Only capture if a current model exists (meaning this isn't the first load)
    if (currentMesh && camera && controls) {
        savedPosition = camera.position.clone();
        savedTarget = controls.target.clone();
    }
    // ---------------------------------------------------------------

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
            color: activeModelColor, 
            roughness: 0.65,    // Spreads the light out to fake a micro-texture sheen
            metalness: 0.70,    // High metallic reflection catching environmental light
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
        
        // ---- STEP 2: RESTORE VIEW OR INITIALIZE CAMERA POSITION ----
        if (savedPosition && savedTarget) {
            // SUBSEQUENT PREVIEWS: Seamlessly drop the camera right back where it was
            camera.position.copy(savedPosition);
            controls.target.copy(savedTarget);
        } else {
            // FIRST RUN ONLY: Auto-fit the perspective zoom based on overall model volume
            const radius = geometry.boundingSphere.radius;
            const targetDistance = radius > 0 ? radius * 3.5 : 50; 

            // Set an ergonomic initial perspective angle looking down at the origin
            camera.position.set(targetDistance, targetDistance * 1.2, targetDistance);
            controls.target.set(0, 0, 0); // Lock rotation pivot permanently to true [0,0,0] origin
            camera.lookAt(0, 0, 0);
        }
        
        // CRITICAL: Force OrbitControls to synchronize its internal matrices with the current state
        controls.update();
        // ------------------------------------------------------------
        
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

// ==========================================================================
// ⚙️ SETTINGS OVERLAY CONTROLLER LOGIC
// ==========================================================================

// 1. Grab the new DOM structural element references
const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const settingsOverlay = document.getElementById('settings-overlay');

/**
 * Opens the workspace settings modal panel
 */
function openSettingsMenu() {
    if (settingsOverlay) {
        settingsOverlay.classList.remove('hidden');
    }
}

/**
 * Closes the workspace settings modal panel
 */
function closeSettingsMenu() {
    if (settingsOverlay) {
        settingsOverlay.classList.add('hidden');
    }
}

// 2. Attach clean, dedicated click listeners to open and close the view
if (btnSettings) {
    btnSettings.addEventListener('click', openSettingsMenu);
}

if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', closeSettingsMenu);
}

// 3. Ambient UX: Close the settings card if the user clicks anywhere on the dark blurred background tint
window.addEventListener('click', (event) => {
    if (event.target === settingsOverlay) {
        closeSettingsMenu();
    }
});

// 4. Keyboard Accessibility: Close the window instantly if the user presses the Escape key
window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && settingsOverlay && !settingsOverlay.classList.contains('hidden')) {
        logToConsole('⌨️ Hotkey Triggered: [Escape] - Closing Settings');
        closeSettingsMenu();
    }
});

// 5. Project Name Change Event Handler
if (projectNameInput) {
    projectNameInput.addEventListener('input', (event) => {
        // Strip any illegal filename path characters while typing
        let cleanedName = event.target.value.replace(/[/\\?%*:|"<>. ]/g, '_');
        
        // Update global variable and local storage cache instantly
        activeProjectName = cleanedName || 'untitled';
        localStorage.setItem('openscad_project_name', activeProjectName);
        
        // Sync straight to the desktop window top border panel frame
        updateWindowTitle();
    });
    
    // Optional: when the input field loses focus, reset empty fields to 'untitled'
    projectNameInput.addEventListener('blur', (event) => {
        if (!event.target.value.trim()) {
            event.target.value = 'untitled';
            activeProjectName = 'untitled';
            localStorage.setItem('openscad_project_name', 'untitled');
            updateWindowTitle();
        }
    });
}

// 6. Camera Viewport Boundary Reset Engine
if (btnCameraReset) {
    btnCameraReset.addEventListener('click', () => {
        // Safety Check: Verify if a model is actually rendered on screen
        if (currentMesh && currentMesh.geometry && camera && controls) {
            
            const geometry = currentMesh.geometry;
            
            // Execute your engine's native bounding box framing math
            const radius = geometry.boundingSphere.radius;
            const targetDistance = radius > 0 ? radius * 3.5 : 50;
            
            logToConsole('🎥 Resetting camera matrix to factory default frame parameters...');
            
            // Match your system's exact starting boot coordinates
            camera.position.set(targetDistance, targetDistance * 1.2, targetDistance);
            controls.target.set(0, 0, 0); // Re-clamp rotation pivot back to true center
            camera.lookAt(0, 0, 0);
            
            // Force OrbitControls to synchronize and update its matrices
            controls.update();
            
            // Ambient UX: Close the settings overlay panel so they instantly see the view shift
            closeSettingsMenu();
            
        } else {
            logToConsole('⚠️ Cannot reset view: No active 3D geometry loaded on screen.');
        }
    });
}

// 7. Live Editor Text Scaling Change Listener
if (editorFontSizeSelect && editor) {
    editorFontSizeSelect.addEventListener('change', (event) => {
        const selectedSize = event.target.value;
        
        // 1. Commit layout properties dynamically to browser cache memory
        localStorage.setItem('openscad_editor_font_size', selectedSize);
        
        // 2. Adjust text block rendering instantly on screen
        editor.style.fontSize = selectedSize;
        
        logToConsole(`🔎 Editor text scales reconfigured to: ${selectedSize}`);
    });
}
