import { defineConfig } from "vite";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({plugins:[react(),tailwindcss()],resolve:{alias:{"@":resolve(import.meta.dirname,"../src")}},server:{host:"127.0.0.1",port:7784,strictPort:true,proxy:{"/_sql-fixture":{target:"http://127.0.0.1:8529"},"/v1/custom-endpoints":{target:"http://127.0.0.1:8529"}}}});
