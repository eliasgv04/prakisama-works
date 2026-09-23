import { defineConfig } from 'vite';
import { swPrecache } from './scripts/vite-plugin-sw.mjs';

export default defineConfig({
  // Rutas relativas: la app funciona igual en la raíz de un dominio o en un subdirectorio.
  base: './',
  plugins: [swPrecache()],
  build: { target: 'es2022' },
});
