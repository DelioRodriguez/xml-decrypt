# Desplegar XML ENCRIPT en Dokploy

La pantalla se publica en `https://ui.sysbombillo.com`. El servicio de desencriptación ya existe en `https://api.syselbombillo.com/nomina/decrypt`. Este proyecto despliega la pantalla y un intermediario Node.js en un único contenedor: el navegador llama a `https://ui.sysbombillo.com/api/decrypt` y el intermediario envía el archivo al servicio existente con `X-Api-Key`. No necesitas desplegar otra instancia del servicio de desencriptación. La imagen se construye desde el código fuente; no necesitas subir `node_modules`, `dist` ni `build-server`.

## 1. Subir el proyecto al repositorio

Sube a tu repositorio los archivos del proyecto, incluyendo `Dockerfile`, `.dockerignore`, `package.json`, `package-lock.json`, los archivos `tsconfig*.json`, `vite.config.ts`, `index.html`, `src/`, `public/` y `server/`. Los tests de `server/` también son necesarios: se ejecutan durante la construcción.

Los archivos `.env*` con claves, `.enc`, `.xml`, `node_modules` y compilaciones están excluidos por Git y Docker. Solo `.env.example` está permitido en Git y contiene ejemplos sin la clave real.

## 2. Crear una Application

En Dokploy, entra a tu Project y crea un servicio de tipo **Application** llamado `xml-encript`.

En **General**, conecta el proveedor Git/GitHub que tenga tu repositorio, selecciona el repositorio y la rama que vas a desplegar. Si el repositorio es privado, autoriza a Dokploy a leerlo.

## 3. Configurar la construcción

Selecciona **Build Type: Dockerfile** y guarda estos valores:

| Campo | Valor |
| --- | --- |
| Dockerfile Path | `Dockerfile` |
| Docker Context Path | `.` |
| Docker Build Stage | `runtime` |

El Dockerfile ejecuta `npm ci`, compila la aplicación y ejecuta las pruebas. La etapa `runtime` incluye el frontend y el backend compilados; ejecuta `node build-server/index.js` y escucha en `0.0.0.0:3000`.

No hace falta configurar comandos adicionales de build o start. La clave del servicio se usa en ejecución; no la añadas como Build Time Argument.

## 4. Variables de entorno

En **Environment**, configura y guarda:

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
DECRYPT_API_KEY=PEGA_AQUI_LA_CLAVE_QUE_PROPORCIONASTE
```

Reemplaza el valor de `DECRYPT_API_KEY` por tu clave real. No uses el prefijo `VITE_`. El contenedor no iniciará en producción si falta la clave.

Para tu dominio definitivo, agrega también:

```dotenv
PUBLIC_ORIGIN=https://ui.sysbombillo.com
```

Es opcional. Si lo configuras, debe coincidir exactamente con el origen que visitas: protocolo y dominio, sin ruta ni barra final. Con esa variable, una petición desde otro dominio se rechaza. Si alternas entre un dominio temporal y el definitivo, omite la variable hasta elegir uno. La comprobación de origen no sustituye un control de acceso de usuarios.

Guarda los cambios y vuelve a desplegar si cambias las variables después del primer despliegue.

## 5. Dominio y HTTPS

Crea en tu proveedor DNS un registro `A` con nombre `ui` en la zona `sysbombillo.com`, apuntando a la IP pública del servidor Dokploy. El registro del backend existente `api.syselbombillo.com` mantiene su configuración.

En **Domains → Add Domain**, configura:

| Campo | Valor |
| --- | --- |
| Host | `ui.sysbombillo.com` (sin `https://`) |
| Path | `/` |
| Internal Path | `/` o vacío, según la interfaz |
| Strip Path | Desactivado |
| Container Port | `3000` |
| HTTPS | Activado |
| Certificate | Let's Encrypt |

Guarda. El dominio debe servir la aplicación desde `/`, porque la pantalla llama a `/api/decrypt`. Mantén accesibles los puertos públicos 80 y 443 para Traefik y el certificado. No necesitas publicar el puerto 3000 al host en Advanced → Ports: Traefik enruta al puerto interno del contenedor.

## 6. Desplegar y verificar

Pulsa **Deploy** y revisa los logs. La construcción debe terminar con las pruebas aprobadas. En los logs de ejecución debe aparecer:

```text
XML ENCRIPT escuchando en 0.0.0.0:3000
```

Abre `https://ui.sysbombillo.com/healthz`; debe devolver HTTP 200:

```json
{"status":"ok"}
```

El Dockerfile incluye un healthcheck para `/healthz`. Esta ruta confirma que la aplicación responde y tiene una clave configurada; no comprueba que la clave sea aceptada por el servicio externo.

Abre el dominio, carga un `.enc` válido y pulsa **Desencriptar archivo**. Confirma que puedes visualizar y descargar el XML. Esta es la comprobación final del servicio externo.

## Diagnóstico rápido

| Síntoma | Qué revisar |
| --- | --- |
| No inicia; aparece `Configura DECRYPT_API_KEY` | Agrega la clave en Environment, guarda y redeploy. |
| Dominio devuelve 502/504 | Logs del contenedor, `HOST=0.0.0.0`, Container Port `3000` y estado del despliegue. |
| `Origen de la solicitud no permitido` | `PUBLIC_ORIGIN` debe ser el origen exacto visitado; también revisa que el proxy conserve el Host. |
| Error 401/403 del servicio al desencriptar | Verifica la clave del servicio y sus permisos. |
| Falla solo con archivos grandes | El límite de la aplicación es 10 MiB; revisa también límites de subida del proxy. |
| Error 502 al desencriptar, pero la página funciona | El contenedor necesita salida HTTPS hacia `api.syselbombillo.com`. |
| Error 504 al desencriptar | El servicio superó el tiempo de espera de 90 segundos. |
| No se genera el certificado | Revisa DNS hacia el servidor, puertos 80/443 y logs de Traefik. |

## Actualizaciones

Sube los cambios al repositorio y pulsa Deploy nuevamente. Cada construcción ejecuta build y pruebas. También puedes activar el despliegue automático de Dokploy para la rama seleccionada. La aplicación no necesita volúmenes persistentes y procesa los archivos en memoria.

## Referencias

- [Dokploy: configuración Dockerfile](https://docs.dokploy.com/docs/core/applications/build-type)
- [Dokploy: variables de entorno de Applications](https://docs.dokploy.com/docs/core/applications)
- [Dokploy: dominio, puerto interno y HTTPS](https://docs.dokploy.com/docs/core/domains)
