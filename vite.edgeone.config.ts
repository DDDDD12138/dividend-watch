import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// EdgeOne Pages 只需要纯前端产物，接口由 functions/ 目录下的边缘函数提供。
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/edgeone', emptyOutDir: true },
})
