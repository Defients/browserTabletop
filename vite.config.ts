import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(({ mode }) => ({root:'apps/web',base:mode === 'neocities' ? './' : '/',plugins:[react(),tailwindcss()],server:{port:5173,strictPort:true,proxy:{'/api/':'http://127.0.0.1:3000','/ready':'http://127.0.0.1:3000','/ws':{target:'ws://127.0.0.1:3000',ws:true}}},build:{outDir:mode === 'neocities' ? '../../dist/neocities' : '../../dist/client',emptyOutDir:true}}));
