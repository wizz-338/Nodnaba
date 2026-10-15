import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' keeps every asset path relative, so the build works on
// https://<user>.github.io/<repo>/ regardless of the repository name.
export default defineConfig({
  plugins: [react()],
  base: './',
})
