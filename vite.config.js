import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' para funcionar tanto na raiz (Netlify) como em subcaminho (GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [react()],
})
