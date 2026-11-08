import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** Parse the shipped geometry in Node; browser QA covers image decoding. */
export async function authoredModel(asset: string) {
  const source = new URL(`../../../frontend/space-escape/public${asset}`, import.meta.url);
  const json = JSON.parse(await readFile(source, "utf8"));
  for (const buffer of json.buffers) {
    const data = await readFile(new URL(buffer.uri, source));
    buffer.uri = `data:application/octet-stream;base64,${data.toString("base64")}`;
  }
  // A data URI avoids network I/O; its loader still emits browser progress events.
  globalThis.ProgressEvent ??= class extends Event {
    constructor(type: string) { super(type); }
  } as typeof ProgressEvent;
  const loader = new GLTFLoader();
  loader.register(() => ({ name: "node-test-textures", loadTexture: async () => new THREE.Texture() }));
  return loader.parseAsync(JSON.stringify(json), "");
}
