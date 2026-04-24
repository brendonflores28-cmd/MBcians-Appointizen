import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || '';

  return {
    server: {
      port: 5173,
      proxy: proxyTarget
        ? {
            '/api': {
              target: proxyTarget,
              changeOrigin: true,
            },
            '/socket.io': {
              target: proxyTarget,
              changeOrigin: true,
              ws: true,
            },
            '/uploads': {
              target: proxyTarget,
              changeOrigin: true,
            },
          }
        : undefined,
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          login: resolve(__dirname, 'login.html'),
          register: resolve(__dirname, 'register.html'),
          student: resolve(__dirname, 'student/index.html'),
          admin: resolve(__dirname, 'admin/index.html'),
          cashier: resolve(__dirname, 'cashier/index.html'),
          staff: resolve(__dirname, 'staff/index.html'),
          head: resolve(__dirname, 'head/index.html'),
        },
      },
    },
  };
});
