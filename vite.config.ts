// ABOUTME: Vite configuration for the Cinder FHIR browser app.
// ABOUTME: Configures React plugin, test setup, CORS proxy with GCP auth, and Mantine PostCSS.
import { existsSync } from 'fs';
import { GoogleAuth } from 'google-auth-library';
import { resolve } from 'path';
import type { Plugin } from 'vite';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function gcpAuthPlugin(saPath: string): Plugin {
  let auth: GoogleAuth | undefined;
  if (existsSync(saPath)) {
    auth = new GoogleAuth({
      keyFile: saPath,
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  }

  return {
    name: 'gcp-auth',
    configureServer(server) {
      if (!auth) return;
      server.middlewares.use(async (req, _res, next) => {
        if (req.url?.startsWith('/fhir') && !req.headers['authorization']) {
          try {
            const client = await auth.getClient();
            const token = await client.getAccessToken();
            if (token.token) {
              req.headers['authorization'] = `Bearer ${token.token}`;
            }
          } catch (e) {
            console.error('Failed to get GCP access token:', e);
          }
        }
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const project = env.VITE_GCP_PROJECT ?? '';
  const location = env.VITE_GCP_LOCATION ?? '';
  const dataset = env.VITE_GCP_DATASET ?? '';
  const fhirStore = env.VITE_GCP_FHIR_STORE ?? '';

  const targetBase = `https://healthcare.googleapis.com/v1/projects/${project}/locations/${location}/datasets/${dataset}/fhirStores/${fhirStore}/fhir`;

  return {
    plugins: [
      react(),
      gcpAuthPlugin(resolve(__dirname, 'service-account.json')),
    ],
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
