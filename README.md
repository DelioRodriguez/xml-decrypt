# XML ENCRIPT

Pantalla React + TypeScript para cargar archivos de nómina encriptados `.enc`, desencriptarlos y visualizar, copiar o descargar el XML resultante.

## Desarrollo

Requiere Node.js 24 o superior y npm.

```bash
npm ci
cp .env.example .env.local
# Configura DECRYPT_API_KEY en .env.local
npm run dev
```

La clave proporcionada ya está configurada en el archivo local `.env.local`, ignorado por Git. No debe usar el prefijo `VITE_`: el navegador nunca necesita conocerla. En otros entornos establece `DECRYPT_API_KEY` como variable del servidor o en `.env.local`.

## Servicio

El navegador envía `POST /api/decrypt` con un formulario `multipart/form-data` y un archivo en el campo `file`. El intermediario de servidor valida un único archivo `.enc` no vacío de hasta 10 MiB y lo envía a `https://api.syselbombillo.com/nomina/decrypt` con el header `X-Api-Key`. El límite es propio de esta aplicación, no una especificación del servicio. El navegador y el servidor generan automáticamente el boundary del formulario.

Los archivos se procesan en memoria sin guardarse en disco. La respuesta conserva el estado HTTP y el tipo de contenido del servicio; la pantalla permite visualizar XML directo o XML incluido en JSON. Otras respuestas se muestran y descargan como texto. El servidor aplica un tiempo máximo de 90 segundos y la pantalla muestra errores del servicio y de conexión.

## Producción en Dokploy

La guía completa está en [docs/DEPLOY_DOKPLOY.md](docs/DEPLOY_DOKPLOY.md). Usa una Application con build Dockerfile, contexto `.`, etapa `runtime` y dominio dirigido al puerto `3000`. Configura `DECRYPT_API_KEY` en Environment antes de desplegar. La imagen ejecuta JavaScript compilado con Node 24, como usuario no root y sin dependencias de compilación ni archivos de entorno.

## Producción local

```bash
npm run build
npm start
```

Abre `http://127.0.0.1:3000`. `PORT` y `HOST` permiten configurar la escucha. El servidor compilado en `build-server` sirve `dist`, `/api/decrypt` y `/healthz`. Una publicación necesita este servidor o un backend equivalente; subir solo `dist` no proporciona la API. Configura HTTPS y el control de acceso adecuado en el entorno donde se publique.

`npm run preview` también incluye el intermediario para verificar la compilación localmente.

## Verificación

```bash
npm run build
npm test
```

Las pruebas verifican el servidor compilado, los archivos estáticos, la ruta de salud y, con un servicio simulado, el formulario multipart, el header de autenticación, la integridad del archivo y los errores de validación/conexión. La comprobación de una desencriptación real requiere un `.enc` válido del servicio.
