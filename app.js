// Dom Elements
const editor = document.getElementById('editor');
const consoleBox = document.getElementById('console');
const btnSave = document.getElementById('btn-save');
const fileLoad = document.getElementById('file-load');
const btnPreview = document.getElementById('btn-preview');
const btnExport = document.getElementById('btn-export');
const viewer3d = document.getElementById('3d-viewer');
const placeholderText = document.getElementById('placeholder-text');

// OpenSCAD WASM Instance variable
let openSCADInstance = null;
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


// ---- OPENSCAD WASM INITIALIZATION ----

async function initOpenSCAD() {
    logToConsole('Loading OpenSCAD module from CDN...');
    try {
        const OpenSCADModule = await import('https://cdn.jsdelivr.net/npm/openscad-wasm@0.0.4/openscad.js');
        
        // Smart search: check every possible way Emscripten might have packed the factory function
        let openSCADFactory = null;
        
        if (typeof OpenSCADModule.default === 'function') {
            openSCADFactory = OpenSCADModule.default;
        } else if (typeof OpenSCADModule.OpenSCAD === 'function') {
            openSCADFactory = OpenSCADModule.OpenSCAD;
        } else if (typeof window.OpenSCAD === 'function') {
            openSCADFactory = window.OpenSCAD;
        } else if (typeof window.Module === 'function') {
            openSCADFactory = window.Module;
        }
        
        // If it's still missing, pull a diagnostic report to see what it actually looks like
        if (!openSCADFactory) {
            const availableKeys = Object.keys(OpenSCADModule).join(', ') || 'none';
            throw new Error(`Initialization function not found. Module keys: [${availableKeys}]. Globals: OpenSCAD=${typeof window.OpenSCAD}, Module=${typeof window.Module}`);
        }

        // Initialize the engine using the found factory function
        openSCADInstance = await openSCADFactory({
            locateFile: (path) => `https://cdn.jsdelivr.net/npm/openscad-wasm@0.0.4/${path}`,
            print: (text) => logToConsole(`[OpenSCAD]: ${text}`),
            printErr: (text) => logToConsole(`[ERROR]: ${text}`)
        });

        logToConsole('OpenSCAD WASM Engine fully loaded and ready!');
        btnPreview.disabled = false;
    } catch (err) {
        logToConsole(`Failed to initialize OpenSCAD: ${err.message}`);
        console.error(err);
    }
}


// ---- THE PREVIEW TRIGGER (F5 Style) ----

btnPreview.addEventListener('click', async () => {
    if (!openSCADInstance) {
        logToConsole('Error: OpenSCAD engine is not ready yet.');
        return;
    }

    logToConsole('--- Generating Preview ---');
    const scriptCode = editor.value;

    try {
        // 1. Write the text using an absolute virtual root path '/'
        openSCADInstance.FS.writeFile('/input.scad', scriptCode);
        logToConsole('Code loaded into virtual memory.');

        // 2. Execute OpenSCAD using explicit absolute file paths.
        logToConsole('Compiling geometry via WASM...');
        openSCADInstance.callMain(['/input.scad', '-o', '/output.stl']);
        
        // 3. Verify if the file was created successfully in the absolute path
        if (openSCADInstance.FS.analyzePath('/output.stl').exists) {
            logToConsole('SUCCESS: 3D Mesh computed.');

            // 4. Read the raw binary data out of the absolute virtual path
            const stlData = openSCADInstance.FS.readFile('/output.stl');

            // 5. Clean up virtual memory immediately so the cache doesn't bloat
            openSCADInstance.FS.unlink('/output.stl');

            // 6. Turn that raw data into a usable object browser URL
            currentStlBlob = new Blob([stlData], { type: 'model/stl' });
            const blobUrl = URL.createObjectURL(currentStlBlob);

            // 7. Feed the URL to our 3D viewer and hide placeholder text
            viewer3d.src = blobUrl;
            placeholderText.style.display = 'none';
            
            logToConsole('3D View updated successfully.');
            btnExport.disabled = false;
        } else {
            logToConsole('ERROR: output.stl was not created. Check console logs above for design errors.');
        }

    } catch (error) {
        logToConsole(`Execution error: ${error.message}`);
        console.error(error);
    } finally {
        // Reset argument pointers for next clicks
        if (openSCADInstance && openSCADInstance.stubForNextCallMain) {
            openSCADInstance.stubForNextCallMain();
        }
    }
});


// ---- THE EXPORT TRIGGER (Save STL) ----

btnExport.addEventListener('click', () => {
    if (!currentStlBlob) {
        logToConsole('Nothing to export. Run Preview first.');
        return;
    }
    
    // Download the already generated blob
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

// Start initializing the engine immediately when the page loads
btnPreview.disabled = true;
btnExport.disabled = true;
initOpenSCAD();
