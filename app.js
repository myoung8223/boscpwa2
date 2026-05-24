// ---- BUILD VERSION CONTROLLER ----
const BUILD_NUMBER = "60"; // <-- Increment this number whenever you commit!

// 🍯 Import standalone, offline-ready CodeJar framework
import { CodeJar } from './libs/codejar.min.js';

// Dom Elements
const editorElement = document.getElementById('editor'); // Pointing to the new CodeJar div
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

/*
// 🍯 INITIALIZE CODEJAR INSTANCE
// Connects the text listener module to global Prism syntax coloring
const jar = CodeJar(editorElement, (el) => {
    // This hook runs on every keystroke, forcing Prism to scan the text tokens
    if (typeof Prism !== 'undefined') {
        Prism.highlightElement(el);
    }
});
*/

// 🍯 INITIALIZE CODEJAR INSTANCE
// Connects the text listener module to global Prism syntax coloring and matches brackets
const jar = CodeJar(
    editorElement, 
    (el) => {
        // 1. Run Prism to color the keywords first
        if (typeof Prism !== 'undefined') {
            Prism.highlightElement(el);
        }
        
        // 2. Safely run our upgraded native text cursor bracket matching pass
        try {
            applyInlineBracketMatching(el);
        } catch (e) {
            console.error("Bracket matching engine error:", e);
        }
    },
    { 
        tab: '\t',
        history: true,
        indentOn: /^\s*$/,
        // 🛑 THE ULTIMATE AUTOCOMPLETE KILL SWITCH:
        // By passing a RegExp that can never logically match anything, 
        // CodeJar will never auto-close another bracket or parenthesis!
        open: /$^/,
        close: /$^/,
        moveTo: /$^/
    } 
);

// ==========================================================================
// 💡 UPGRADED: BI-DIRECTIONAL CODEJAR BRACKET MATCHING ENGINE (FIX ISSUE 2)
// ==========================================================================
function applyInlineBracketMatching(editorDiv) {
    // Clear any previous bracket highlights from the last keystroke
    const oldHighlights = editorDiv.querySelectorAll('.bracket-match-glow, .bracket-mismatch-glow');
    oldHighlights.forEach(span => {
        span.classList.remove('bracket-match-glow', 'bracket-mismatch-glow');
    });

    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    
    const range = selection.getRangeAt(0);
    const textContent = editorDiv.textContent;
    
    // Calculate character index deep within the text stream
    let cursorIndex = 0;
    const treeWalker = document.createTreeWalker(editorDiv, NodeFilter.SHOW_TEXT);
    let currentNode = treeWalker.nextNode();
    
    while (currentNode) {
        if (currentNode === range.startContainer) {
            cursorIndex += range.startOffset;
            break;
        }
        cursorIndex += currentNode.textContent.length;
        currentNode = treeWalker.nextNode();
    }

    const partners = { '{': '}', '}': '{', '[': ']', ']': '[', '(': ')', ')': '(' };
    
    // 🧠 BI-DIRECTIONAL CHECK: Look right next to the cursor, then look slightly left
    let targetIndex = cursorIndex;
    let charToMatch = textContent[targetIndex];
    
    if (!partners[charToMatch]) {
        targetIndex = cursorIndex - 1;
        charToMatch = textContent[targetIndex];
    }
    
    // If neither side holds a valid structural bracket, step out smoothly
    if (!partners[charToMatch]) return;
    
    const partnerChar = partners[charToMatch];
    const isForwardScan = ['{', '[', '('].includes(charToMatch);
    
    let matchIndex = -1;
    let balanceCounter = 0;

    // Scan the string vector for the balancing structural partner
    if (isForwardScan) {
        for (let i = targetIndex; i < textContent.length; i++) {
            if (textContent[i] === charToMatch) balanceCounter++;
            if (textContent[i] === partnerChar) balanceCounter--;
            if (balanceCounter === 0) {
                matchIndex = i;
                break;
            }
        }
    } else {
        for (let i = targetIndex; i >= 0; i--) {
            if (textContent[i] === charToMatch) balanceCounter++;
            if (textContent[i] === partnerChar) balanceCounter--;
            if (balanceCounter === 0) {
                matchIndex = i;
                break;
            }
        }
    }

    // Identify and link onto the precise target elements inside the UI view tree
    let absoluteOffset = 0;
    let targetSpanNode = null;
    let matchSpanNode = null;

    const walker = document.createTreeWalker(editorDiv, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();

    while (textNode) {
        const nodeLength = textNode.textContent.length;
        
        if (targetIndex >= absoluteOffset && targetIndex < absoluteOffset + nodeLength) {
            targetSpanNode = textNode.parentNode;
        }
        if (matchIndex !== -1 && matchIndex >= absoluteOffset && matchIndex < absoluteOffset + nodeLength) {
            matchSpanNode = textNode.parentNode;
        }
        
        absoluteOffset += nodeLength;
        textNode = walker.nextNode();
    }

    // Paint the elements using the application CSS layers
    if (targetSpanNode) {
        if (matchIndex !== -1 && matchSpanNode) {
            targetSpanNode.classList.add('bracket-match-glow');
            matchSpanNode.classList.add('bracket-match-glow');
        } else {
            targetSpanNode.classList.add('bracket-mismatch-glow');
        }
    }
}


// ==========================================================================
// 🖥️ PERSISTENT CONSOLE VISIBILITY TOGGLE
// ==========================================================================
const toggleConsoleBtn = document.getElementById('btn-toggle-console');

if (consoleBox && toggleConsoleBtn) {
    // 1. Read layout state from cache (default to 'visible' if never configured)
    let isConsoleVisible = localStorage.getItem('openscad_console_visible') !== 'hidden';

    // 2. Define the layout application function inside the block
    const applyConsoleLayout = (visible) => {
        if (visible) {
            consoleBox.style.display = 'block';
            toggleConsoleBtn.textContent = 'Visible';
            toggleConsoleBtn.style.backgroundColor = '#28a745'; // Balanced UI Green
            isConsoleVisible = true;
            localStorage.setItem('openscad_console_visible', 'visible');
        } else {
            consoleBox.style.display = 'none';
            toggleConsoleBtn.textContent = 'Hidden';
            toggleConsoleBtn.style.backgroundColor = '#dc3545'; // Attention Red
            isConsoleVisible = false;
            localStorage.setItem('openscad_console_visible', 'hidden');
        }
    };

    // Initialize layout immediately on page bootup
    applyConsoleLayout(isConsoleVisible);

    // 3. Click Listener: Put this INSIDE the conditional block!
    toggleConsoleBtn.addEventListener('click', () => {
        applyConsoleLayout(!isConsoleVisible);
        
        if (isConsoleVisible && typeof logToConsole === 'function') {
            logToConsole("🖥️ Console tracking workspace restored.");
        }
    });
}

// ==========================================================================
// 🔣 LINE NUMBERS & PERSISTENT TOGGLE CONTROLLER
// ==========================================================================
const toggleLinesBtn = document.getElementById('btn-toggle-lines');
const lineNumbersDiv = document.getElementById('line-numbers');

// 🔄 GLOBAL BRIDGE: This lets any function lower down in app.js trigger a line recount!
let triggerLineUpdate = null;

if (editorElement && lineNumbersDiv && toggleLinesBtn) {
    
    // 1. Core Generator: Count lines inside CodeJar string matrix and populate sidebar
    const updateLineNumbers = (codeText) => {
        // Fallback to reading the engine directly if code string isn't explicitly passed
        const currentCode = (typeof codeText === 'string') ? codeText : jar.toString();
        const linesCount = currentCode.split('\n').length;
        const linesArray = Array.from({ length: linesCount }, (_, i) => i + 1);
        lineNumbersDiv.innerHTML = linesArray.join('<br>');
    };

    // Expose the internal function to our global bridge variable
    triggerLineUpdate = updateLineNumbers;

    // Synchronize numbers and local cache continuously via CodeJar's built-in event hook
    jar.onUpdate((code) => {
        updateLineNumbers(code);
        localStorage.setItem('openscad_editor_cache', code);
    });

    // 2. Scroll Synchronization: Lock sidebar position to CodeJar div text scroll track
    editorElement.addEventListener('scroll', () => {
        lineNumbersDiv.scrollTop = editorElement.scrollTop;
    });

    // 3. Persistent Visibility Toggle Management
    let isLinesEnabled = localStorage.getItem('openscad_lines_visible') !== 'disabled';

    const applyLinesLayout = (enabled) => {
        if (enabled) {
            lineNumbersDiv.style.display = 'block';
            toggleLinesBtn.textContent = 'Enabled';
            toggleLinesBtn.style.backgroundColor = '#28a745'; // Balanced UI Green
            isLinesEnabled = true;
            localStorage.setItem('openscad_lines_visible', 'enabled');
            
            // 🔄 FORCE RECALCULATION: Populate text lines immediately when turning visible
            updateLineNumbers();
            // Sync up scroll layout in case user scrolled while it was hidden
            lineNumbersDiv.scrollTop = editorElement.scrollTop;
        } else {
            lineNumbersDiv.style.display = 'none';
            toggleLinesBtn.textContent = 'Disabled';
            toggleLinesBtn.style.backgroundColor = '#dc3545'; // Attention Red
            isLinesEnabled = false;
            localStorage.setItem('openscad_lines_visible', 'disabled');
        }
    };

    // 🚀 INITIALIZE CODES ON PAGE BOOT UP:
    updateLineNumbers();
    applyLinesLayout(isLinesEnabled);

    toggleLinesBtn.addEventListener('click', () => {
        applyLinesLayout(!isLinesEnabled);
    });
}

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

if (editorElement && editorFontSizeSelect) {
    editorElement.style.fontSize = savedFontSizeStr;
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
    const code = jar.toString(); // 🍯 UPGRADED: Pull code string directly from CodeJar
    const blob = new Blob([code], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    
    let safeFilename = activeProjectName.trim().replace(/\.scad$/i, '');
    if (!safeFilename) safeFilename = "untitled"; 
    
    link.download = `${safeFilename}.scad`;
    link.click();
    logToConsole(`Saved ${safeFilename}.scad successfully.`);
});

// Load local .scad file
fileLoad.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        jar.updateCode(e.target.result); // 🍯 UPGRADED: Seed loaded text into CodeJar frame
        logToConsole(`Loaded file: ${file.name}`);

        localStorage.setItem('openscad_editor_cache', e.target.result);

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

async function initOpenSCAD() {
    logToConsole(`Build ${BUILD_NUMBER} - May 22, 2026`);
    logToConsole('System ready. Instantiating WASM...');
    
    // Restore persistent code cache
    const savedCode = localStorage.getItem('openscad_editor_cache');
    if (savedCode && savedCode.trim() !== "") {
        jar.updateCode(savedCode); // 🍯 UPGRADED
        logToConsole('Restored draft layout from your last active session.');
    } else {
        const defaultCode = `linear_extrude(height = 4) {\n\ttext(\n\t\ttext = "Hello, world!", \n\t\tsize = 14, \n\t\tfont = "Liberation Sans:style=Bold", \n\t\thalign = "center", \n\t\tvalign = "center"\n\t);\n}`;
        jar.updateCode(defaultCode); // 🍯 UPGRADED
        logToConsole('Seeded editor workspace with default starter geometry.');
    }

    // 🚀 UPDATE LINE NUMBERS INSTANTLY ON PAGE LOAD
    if (typeof triggerLineUpdate === 'function') {
        triggerLineUpdate();
    }
    
    logToConsole('Loading browser-optimized OpenSCAD module...');
    try {
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
                
                fontCache[fontName] = fontData;
                logToConsole(`✔ Cached ${fontName} in memory (${fontData.byteLength} bytes)`);
            } catch (fontErr) {
                console.error(`Error processing font asset "${fontName}":`, fontErr);
            }
        }
        
        logToConsole('✅ Typography suite successfully cached in global memory!');
        logToConsole('OpenSCAD Engine ready! Alter code and click Preview freely.');

        btnPreview.disabled = false;
        
        logToConsole('Running initial boot preview...');
        btnPreview.click();
        
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
    const scriptCode = jar.toString(); // 🍯 UPGRADED: Pull raw string snapshot from CodeJar
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

        try { instance.FS.mkdir('/fonts'); } catch(e) { /* ignore */ }
        
        for (const [fontName, fontData] of Object.entries(fontCache)) {
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

        // 1. Write the user's code into the fresh instance's virtual memory
        instance.FS.writeFile('/input.scad', scriptCode);
        logToConsole('Code loaded into virtual memory.');

        // 2. Execute OpenSCAD compilation
        logToConsole('Compiling geometry via WASM...');
        instance.callMain(['/input.scad', '-o', '/output.stl']);
        
        // 3. Verify output creation
        if (instance.FS.analyzePath('/output.stl').exists) {
            logToConsole('SUCCESS: 3D Mesh computed.');

            const stlData = instance.FS.readFile('/output.stl');

            currentStlBlob = new Blob([stlData], { type: 'application/sla' });
            const blobUrl = URL.createObjectURL(currentStlBlob);
            
            update3DModelViewer(blobUrl);
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

            // 🍯 Note: Highlight line feature skipped for editable inputs to preserve focus states safely
            if (detectedErrorLine) {
                logToConsole(`👉 Suspected syntax break near Line ${detectedErrorLine}.`);
            }
        }

    } catch (error) {
        logToConsole(`Execution error: ${error.message || error}`);
        console.error(error);
    }
});


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

    // ---- 3D WORKSPACE GRID AND ORIGIN AXES ----
    const gridHelper = new THREE.GridHelper(400, 40, 0x007acc, 0x444444);
    gridHelper.position.y = -0.05; 
    scene.add(gridHelper);

    const axesHelper = new THREE.AxesHelper(50);
    axesHelper.rotation.x = -Math.PI / 2;    
    scene.add(axesHelper);

    // ---- CORNER NAVIGATION COMPASS GENERATOR ----
    const compassContainer = document.createElement('div');
    compassContainer.style.position = 'absolute';
    compassContainer.style.top = '10px';
    compassContainer.style.right = '10px';
    compassContainer.style.width = '80px';
    compassContainer.style.height = '80px';
    compassContainer.style.zIndex = '100';
    compassContainer.style.pointerEvents = 'none'; 
    container.appendChild(compassContainer);

    const compassScene = new THREE.Scene();
    const compassCamera = new THREE.PerspectiveCamera(50, 1, 1, 100);
    
    const compassRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true }); 
    compassRenderer.setSize(80, 80);
    compassRenderer.setPixelRatio(window.devicePixelRatio);
    compassContainer.appendChild(compassRenderer.domElement);

    const compassAxes = new THREE.AxesHelper(25);
    compassAxes.rotation.x = -Math.PI / 2;
    compassScene.add(compassAxes);

    // ---- 🖥️ OPENSCAD-OPTIMIZED CAD LIGHTING SYSTEM ----
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.55); 
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.5); 
    keyLight.position.set(150, 200, 100);
    scene.add(keyLight);

    const topLight = new THREE.DirectionalLight(0xffffff, 0.15); 
    topLight.position.set(0, 250, 0);
    scene.add(topLight);

    const headlight = new THREE.DirectionalLight(0xffffff, 0.45);
    headlight.position.set(0, 0, 1); 
    camera.add(headlight); 
    scene.add(camera); 
    
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
            compassCamera.position.copy(camera.position);
            compassCamera.position.sub(controls.target); 
            compassCamera.position.setLength(60); 
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
    
    if (currentMesh && camera && controls) {
        savedPosition = camera.position.clone();
        savedTarget = controls.target.clone();
    }

    if (currentMesh) {
        scene.remove(currentMesh);
        currentMesh.geometry.dispose();
        currentMesh.material.dispose();
        currentMesh = null;
    }

    const loader = new THREE.STLLoader();
    loader.load(blobUrl, (geometry) => {
        geometry.computeVertexNormals();
        
        // ==========================================================================
        // 🎨 PROCEDURAL MATTE NOISE MATERIAL INJECTION
        // ==========================================================================
        const material = new THREE.MeshStandardMaterial({ 
            color: activeModelColor, 
            roughness: 0.85,     
            metalness: 0.05,     
            wireframe: wireframeMode 
        });

        material.onBeforeCompile = (shader) => {
            const noiseGLSL = `
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
                }
                float proceduralNoise(vec3 p) {
                    return hash(p.xy + p.z);
                }
            `;

            shader.fragmentShader = noiseGLSL + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                `#include <opaque_fragment>`,
                `
                float noiseGrit = proceduralNoise(vViewPosition * 4.0) * 0.12;
                outgoingLight.rgb += vec3(noiseGrit - 0.06);
                #include <opaque_fragment>
                `
            );
        };
        // ==========================================================================
        
        currentMesh = new THREE.Mesh(geometry, material);
        
        currentMesh.position.set(0, 0, 0);
        currentMesh.rotation.x = -Math.PI / 2;

        scene.add(currentMesh);
        
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        
        // ---- STEP 2: RESTORE VIEW OR INITIALIZE CAMERA POSITION ----
        if (savedPosition && savedTarget) {
            camera.position.copy(savedPosition);
            controls.target.copy(savedTarget);
        } else {
            const radius = geometry.boundingSphere.radius;
            const targetDistance = radius > 0 ? radius * 3.5 : 50; 

            camera.position.set(targetDistance, targetDistance * 1.2, targetDistance);
            controls.target.set(0, 0, 0); 
            camera.lookAt(0, 0, 0);
        }
        
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

// ==========================================================================
// ⚙️ SETTINGS OVERLAY CONTROLLER LOGIC
// ==========================================================================

const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const settingsOverlay = document.getElementById('settings-overlay');

function openSettingsMenu() {
    if (settingsOverlay) {
        settingsOverlay.classList.remove('hidden');
    }
}

function closeSettingsMenu() {
    if (settingsOverlay) {
        settingsOverlay.classList.add('hidden');
    }
}

if (btnSettings) {
    btnSettings.addEventListener('click', openSettingsMenu);
}

if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', closeSettingsMenu);
}

window.addEventListener('click', (event) => {
    if (event.target === settingsOverlay) {
        closeSettingsMenu();
    }
});

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && settingsOverlay && !settingsOverlay.classList.contains('hidden')) {
        logToConsole('⌨️ Hotkey Triggered: [Escape] - Closing Settings');
        closeSettingsMenu();
    }
});

// 5. Project Name Change Event Handler
if (projectNameInput) {
    projectNameInput.addEventListener('input', (event) => {
        let cleanedName = event.target.value.replace(/[/\\?%*:|"<>. ]/g, '_');
        activeProjectName = cleanedName || 'untitled';
        localStorage.setItem('openscad_project_name', activeProjectName);
        updateWindowTitle();
    });
    
    projectNameInput.addEventListener('blur', (event) => {
        if (!event.target.value.trim()) {
            event.target.value = 'untitled';
            activeProjectName = 'untitled';
            localStorage.setItem('openscad_project_name', 'untitled');
            updateWindowTitle();
        }
    });
}

// 🟢 Editor Text Scaling Change Listener
if (editorFontSizeSelect) {
    editorFontSizeSelect.addEventListener('change', (event) => {
        const selectedSize = event.target.value;
        localStorage.setItem('openscad_editor_font_size', selectedSize);
        if (editorElement) {
            editorElement.style.fontSize = selectedSize;
        }
        logToConsole(`🔎 Editor text scaled to: ${selectedSize}`);
    });
}

// 6. Camera Viewport Boundary Reset Engine
if (btnCameraReset) {
    btnCameraReset.addEventListener('click', () => {
        if (currentMesh && currentMesh.geometry && camera && controls) {
            const geometry = currentMesh.geometry;
            const radius = geometry.boundingSphere.radius;
            const targetDistance = radius > 0 ? radius * 3.5 : 50;
            
            logToConsole('🎥 Resetting camera matrix to factory default frame parameters...');
            
            camera.position.set(targetDistance, targetDistance * 1.2, targetDistance);
            controls.target.set(0, 0, 0); 
            camera.lookAt(0, 0, 0);
            
            controls.update();
            closeSettingsMenu();
        }
    });
}

// ==========================================================================
// 📐 PERSISTENT DRAGGABLE SPLIT-PANE CONTROLLER
// ==========================================================================

const leftPaneContainer = document.getElementById('left-pane-container');
const panelSplitGutter = document.getElementById('panel-split-gutter');

if (leftPaneContainer && panelSplitGutter) {
    const cachedSplitValue = localStorage.getItem('openscad_layout_split') || '50';
    leftPaneContainer.style.width = `${cachedSplitValue}%`;

    panelSplitGutter.addEventListener('mousedown', (e) => {
        e.preventDefault();
        
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        function onMouseMove(moveEvent) {
            let calculatedWidthPercent = (moveEvent.clientX / window.innerWidth) * 100;

            if (calculatedWidthPercent < 15) calculatedWidthPercent = 15;
            if (calculatedWidthPercent > 85) calculatedWidthPercent = 85;

            leftPaneContainer.style.width = `${calculatedWidthPercent}%`;
            
            localStorage.setItem('openscad_layout_split', Math.round(calculatedWidthPercent).toString());
            
            if (typeof renderer !== 'undefined' && renderer && typeof camera !== 'undefined' && camera) {
                const container3d = document.getElementById('viewer-3d');
                if (container3d) {
                    const currentWidth = container3d.clientWidth;
                    const currentHeight = container3d.clientHeight;
                    if (currentWidth > 0 && currentHeight > 0) {
                        camera.aspect = currentWidth / currentHeight;
                        camera.updateProjectionMatrix();
                        renderer.setSize(currentWidth, currentHeight, true);
                    }
                }
            }
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'text';
            
            logToConsole(`📐 Split layout updated and cached to: ${localStorage.getItem('openscad_layout_split')}%`);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}
