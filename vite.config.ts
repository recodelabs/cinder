// ABOUTME: Vite configuration for the Cinder FHIR browser app.
// ABOUTME: Configures React plugin, test setup, CORS proxy, and Mantine PostCSS.
import { resolve } from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const project = env.VITE_GCP_PROJECT ?? '';
  const location = env.VITE_GCP_LOCATION ?? '';
  const dataset = env.VITE_GCP_DATASET ?? '';
  const fhirStore = env.VITE_GCP_FHIR_STORE ?? '';

  const targetBase = `https://healthcare.googleapis.com/v1/projects/${project}/locations/${location}/datasets/${dataset}/fhirStores/${fhirStore}/fhir`;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        'fhir-definitions': resolve(__dirname, 'node_modules/@medplum/definitions/dist/fhir'),
      },
    },
    server: {
      proxy: {
        '/fhir': {
          target: targetBase,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/fhir/, ''),
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test.setup.ts',
    },
  };
});
