/**
 * Cloudflare Worker - Proxy Seguro de Upload para R2 (Vitrine Facilitá)
 * 
 * Como publicar no Painel da Cloudflare (100% gratuito):
 * 1. Acesse Workers & Pages -> Create Worker -> Cole este código.
 * 2. Em Settings -> Variables and Secrets, adicione:
 *    - R2 Bucket Binding: Variável `CATALOGO_BUCKET` apontando para `catalogo-samantha-facilita`
 *    - Environment Variable: `FIREBASE_API_KEY` = (sua apiKey de js/config.js)
 * 3. Copie a URL gerada (ex: https://r2-upload-facilita.seu-usuario.workers.dev)
 *    e coloque em `r2Config.workerUrl` no arquivo js/config.js.
 * 4. Depois de testar, remova `accessKeyId` e `secretAccessKey` de js/config.js
 *    e revogue o token S3 antigo no painel R2 da Cloudflare.
 */

const ALLOWED_EMAILS = [
    'edenirm@gmail.com',
    'atacadofacilita21@gmail.com',
    'michele.wilwert@gmail.com',
    'adilsonwilwert@gmail.com'
];

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
};

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        if (request.method !== 'PUT') {
            return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
        }

        try {
            // 1. Validar Firebase Auth ID Token
            const authHeader = request.headers.get('Authorization') || '';
            const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
            if (!idToken) {
                return new Response('Unauthorized: Missing token', { status: 401, headers: CORS_HEADERS });
            }

            const verifyResp = await fetch(
                `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idToken })
                }
            );

            if (!verifyResp.ok) {
                return new Response('Unauthorized: Invalid token', { status: 401, headers: CORS_HEADERS });
            }

            const verifyData = await verifyResp.json();
            const user = verifyData.users && verifyData.users[0];
            const email = user && user.email ? user.email.toLowerCase() : '';

            if (!email || !ALLOWED_EMAILS.includes(email)) {
                return new Response('Forbidden: Email not authorized', { status: 403, headers: CORS_HEADERS });
            }

            // 2. Validar nome do arquivo e tipo de conteúdo
            const url = new URL(request.url);
            const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
            if (!key || key.includes('..') || !/^[a-zA-Z0-9._-]+$/.test(key)) {
                return new Response('Bad Request: Invalid key', { status: 400, headers: CORS_HEADERS });
            }

            const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
            const allowedTypes = ['image/webp', 'image/jpeg', 'image/png', 'application/json'];
            if (!allowedTypes.some(t => contentType.startsWith(t))) {
                return new Response('Unsupported Media Type', { status: 415, headers: CORS_HEADERS });
            }

            // 3. Gravar no Bucket R2 vinculado
            const body = await request.arrayBuffer();
            await env.CATALOGO_BUCKET.put(key, body, {
                httpMetadata: { contentType }
            });

            return new Response(JSON.stringify({ ok: true, key }), {
                status: 200,
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
            });
        } catch (err) {
            return new Response(`Internal Error: ${err.message}`, {
                status: 500,
                headers: CORS_HEADERS
            });
        }
    }
};
