import { Miniflare } from "miniflare";

const mf = new Miniflare({
  modules: true,
  scriptPath: "index.js",
  liveReload: true,
});

const res = await mf.dispatchFetch("http://localhost:8787/");
console.log(await res.text());
await mf.dispose();
