# <img alt="image" src="https://raw.githubusercontent.com/myoung8223/boscpwa/refs/heads/main/icon-192.png" /> Basic OpenSCAD PWA

A lightweight, browser-optimized Progressive Web App (PWA) that compiles and renders OpenSCAD geometry entirely client-side using WebAssembly (WASM). Write, preview, and iterate on 3D models instantly without local desktop installations.

## Current Features

- **True Client-Side Compilation:** Leverages a browser-optimized WASM engine to compile `.scad` geometry on the fly.
- **Persistent Workspace Cache:** Automatically saves your active session to `localStorage` so your draft layout is securely restored upon reload.
- **Smart Hardware Tabbing:** Pre-configured editor workspace leveraging clean tabbed indentations (`\t`) mapping flawlessly to native text editing layouts.
- **Automatic Preview on Load:** Intelligently triggers a 3D preview render the exact millisecond a local `.scad` file is opened.
- **Streamlined Diagnostic Console:** A real-time terminal UI stripped of misleading native engine `[ERROR]` flags and sandbox filesystem warnings, exposing pure compilation milestones and rendering benchmarks.

## Improvements and Features to Add

- [ ] **Improve 3D Lighting and Model Texturing:** Right now the lighting needs improvement and texturing the models would improve the preview.
- [ ] **Adjustable Editor Font Size:** An adjustable, and persistant font size for the editor would be welcome.
- [ ] **Adjustable Editor/Preview Port Framing:** An adjustable, and persistant editor/preview port framing is needed.
- [ ] **Link to OpenSCAD Cheat Sheet:** The ability to pop-up the super handy OpenSCAD cheat sheet would be a nice feature to add.
- [ ] **Help Button:** Add a Help button for communicating basic use and app information.
- [ ] **Adjustable Axes and Grid:** Additional controls for the axes and grid would be handy.
- [ ] **Orthogonal Projection:** Add a button for toggling between perspective and orthogonal 3D projection.
- [ ] **Camera Movement Improvements:** Improve the camera movement, perhaps with translation accelleration.

## Getting Started

### Local Setup & Initialization

When the application boots up, the execution sequence initiates automatically:

1. **Environment Verification:** Outputs branding identities, build configurations, and instantiates the virtual sandboxed engine.
2. **Workspace Seeding:** Restores your latest layout cache or seeds a default, responsive starter geometry:
   ```openscad
   linear_extrude(height = 4) {
       text(
           text = "Hello, world!", 
           size = 14, 
           font = "Liberation Sans:style=Bold", 
           halign = "center", 
           valign = "center"
       );
   }
   ```
3. **Resource Provisioning:** Fetches and extracts required font configurations directly into the virtual memory system before unlocking the compiler controls.

### File Operations

- **Loading Files:** Click the file input interface to pull local `.scad` documents into the editor workspace. The system bypasses any extra button clicks by automatically firing a 3D scene compile immediately upon upload.

## Built With

- **WebAssembly (WASM)** - High-performance port of the native OpenSCAD engine.
- **Vanilla JavaScript, HTML5, & CSS3** - Lightweight PWA architecture optimized for offline use and instant paints.

## Credits & Contributions

- **Mike Young** — Lead Architect & Creator.
- **Gemini (Flash, Thinking, & Pro)** — AI Engineering Assistant, Code Optimization, & Regex Architecture.
