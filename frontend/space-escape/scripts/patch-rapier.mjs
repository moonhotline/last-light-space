import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const rapierDir = path.join(rootDir, "node_modules/@dimforge/rapier3d-compat/dist");
const partyDir = path.join(rootDir, "frontend/space-escape/party");

// 1. Ensure rapier.wasm is in party directory
const wasmSrc = path.join(rapierDir, "rapier_wasm3d_bg.wasm");
const wasmDest = path.join(partyDir, "rapier.wasm");
if (fs.existsSync(wasmSrc) && !fs.existsSync(wasmDest)) {
  fs.mkdirSync(partyDir, { recursive: true });
  fs.copyFileSync(wasmSrc, wasmDest);
  console.log("Copied rapier_wasm3d_bg.wasm to party/rapier.wasm");
}

// 2. Patch rapier.mjs and rapier.cjs to support passing pre-compiled WebAssembly.Module
const target = "function mg(){return dg(this,void 0,void 0,(function*(){yield uA({module_or_path:ng.toByteArray(";
const replacement = "function mg(A){return dg(this,void 0,void 0,(function*(){yield uA(A?{module_or_path:A}:{module_or_path:ng.toByteArray(";

for (const ext of ["mjs", "cjs"]) {
  const filePath = path.join(rapierDir, `rapier.${ext}`);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, "utf8");
    if (content.includes(target)) {
      content = content.replace(target, replacement);
      fs.writeFileSync(filePath, content, "utf8");
      console.log(`Patched ${filePath} for pre-compiled Wasm support`);
    }
  }
}
