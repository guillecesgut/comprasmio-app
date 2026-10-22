import 'dotenv/config';

/**
 * Toda la configuración por variables de entorno, validada al arrancar: si falta algo
 * obligatorio el servidor no inicia y dice qué falta, en vez de fallar a mitad de una compra.
 */
const env = process.env;
const isProd = env.NODE_ENV === 'production';

function required(name, fallbackForDev) {
  const value = env[name] || (!isProd ? fallbackForDev : undefined);
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}

export const config = {
  isProd,
  port: Number(env.PORT || 4000),
  databaseUrl: required('DATABASE_URL', 'postgres://comprasmio:comprasmio@127.0.0.1:54329/comprasmio'),
  jwtSecret: required('JWT_SECRET', 'comprasmio-dev-secret'),
  // Firma de enlaces a archivos privados (comprobantes). En producción, distinta del JWT.
  fileSecret: required('FILE_SIGNING_SECRET', 'comprasmio-dev-files'),
  publicUrl: (env.PUBLIC_URL || `http://localhost:${env.PORT || 4000}`).replace(/\/$/, ''),
  storage: {
    driver: env.STORAGE_DRIVER || 's3_if_configured',
    bucket: env.STORAGE_BUCKET || '',
    endpoint: env.STORAGE_ENDPOINT || '',
    region: env.STORAGE_REGION || 'auto',
    accessKeyId: env.STORAGE_ACCESS_KEY || '',
    secretAccessKey: env.STORAGE_SECRET_KEY || '',
    localDir: env.STORAGE_LOCAL_DIR || '',
  },
  livekit: {
    url: env.LIVEKIT_URL || '',
    key: env.LIVEKIT_API_KEY || '',
    secret: env.LIVEKIT_API_SECRET || '',
  },
  // Procesos programados (vencimientos, entregado automático). En pruebas se apagan.
  runJobs: env.RUN_JOBS !== 'false',
  demoBots: env.DEMO_BOTS === '1',
};

if (config.storage.driver === 's3_if_configured') {
  config.storage.driver = config.storage.bucket && config.storage.accessKeyId ? 's3' : 'local';
}
if (isProd && config.storage.driver === 'local' && !env.ALLOW_LOCAL_STORAGE) {
  throw new Error('En producción los archivos van a un bucket (STORAGE_BUCKET, STORAGE_ACCESS_KEY…). Para forzar disco local: ALLOW_LOCAL_STORAGE=1.');
}
