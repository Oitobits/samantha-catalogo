/**
 * r2-storage.js - Integração Direta com Cloudflare R2 via AWS SigV4
 * Utiliza Web Crypto API nativa do navegador (rápida, leve, sem bibliotecas externas pesadas).
 */

class R2Storage {
    constructor(config) {
        this.accountId = config.accountId;
        this.bucketName = config.bucketName;
        this.publicUrl = config.publicUrl.replace(/\/+$/, '');
        this.accessKeyId = config.accessKeyId;
        this.secretAccessKey = config.secretAccessKey;
        this.endpoint = `https://${this.accountId}.r2.cloudflarestorage.com`;
        this.region = 'auto';
        this.service = 's3';
    }

    // Converte ArrayBuffer para Hex
    toHex(buffer) {
        return Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    // SHA-256 via Web Crypto
    async sha256(data) {
        const encoder = new TextEncoder();
        const buffer = typeof data === 'string' ? encoder.encode(data) : data;
        const hash = await crypto.subtle.digest('SHA-256', buffer);
        return this.toHex(hash);
    }

    // HMAC-SHA256
    async hmac(key, data) {
        const encoder = new TextEncoder();
        const keyBuffer = typeof key === 'string' ? encoder.encode(key) : key;
        const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
        return signature;
    }

    // Derivação da chave de assinatura SigV4
    async getSignatureKey(secretKey, dateStamp, regionName, serviceName) {
        const kDate = await this.hmac('AWS4' + secretKey, dateStamp);
        const kRegion = await this.hmac(kDate, regionName);
        const kService = await this.hmac(kRegion, serviceName);
        const kSigning = await this.hmac(kService, 'aws4_request');
        return kSigning;
    }

    // Converte Base64 / DataURL em Uint8Array e MimeType
    base64ToBytes(dataUrl) {
        const parts = dataUrl.split(',');
        const mime = parts[0].match(/:(.*?);/)[1] || 'image/webp';
        const binary = atob(parts[1]);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return { bytes, mime };
    }

    /**
     * Faz upload de uma imagem (DataURL Base64 ou Blob/File) para o Cloudflare R2
     * @param {string|Blob|File} imageInput 
     * @param {string} customKey 
     * @returns {Promise<string>} URL pública final da imagem
     */
    async uploadImage(imageInput, customKey = null) {
        let bodyBytes;
        let contentType = 'image/webp';

        if (typeof imageInput === 'string' && imageInput.startsWith('data:')) {
            const parsed = this.base64ToBytes(imageInput);
            bodyBytes = parsed.bytes;
            contentType = parsed.mime;
        } else if (imageInput instanceof Blob || imageInput instanceof File) {
            const arrayBuffer = await imageInput.arrayBuffer();
            bodyBytes = new Uint8Array(arrayBuffer);
            contentType = imageInput.type || 'image/webp';
        } else {
            throw new Error('Formato de imagem inválido para upload no R2.');
        }

        // Gera nome único se não fornecido
        const ext = contentType.includes('webp') ? 'webp' : (contentType.includes('png') ? 'png' : 'jpg');
        const key = customKey || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${ext}`;

        const method = 'PUT';
        const host = `${this.accountId}.r2.cloudflarestorage.com`;
        const canonicalUri = `/${this.bucketName}/${key}`;
        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.substring(0, 8);

        const payloadHash = await this.sha256(bodyBytes);

        // Cabeçalhos canônicos ordenados
        const canonicalHeaders = 
            `content-type:${contentType}\n` +
            `host:${host}\n` +
            `x-amz-content-sha256:${payloadHash}\n` +
            `x-amz-date:${amzDate}\n`;
        const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

        const canonicalRequest = 
            `${method}\n` +
            `${canonicalUri}\n` +
            `\n` +
            `${canonicalHeaders}\n` +
            `${signedHeaders}\n` +
            `${payloadHash}`;

        const canonicalRequestHash = await this.sha256(canonicalRequest);
        const credentialScope = `${dateStamp}/${this.region}/${this.service}/aws4_request`;
        const stringToSign = 
            `AWS4-HMAC-SHA256\n` +
            `${amzDate}\n` +
            `${credentialScope}\n` +
            `${canonicalRequestHash}`;

        const signingKey = await this.getSignatureKey(this.secretAccessKey, dateStamp, this.region, this.service);
        const signatureBytes = await this.hmac(signingKey, stringToSign);
        const signature = this.toHex(signatureBytes);

        const authorizationHeader = 
            `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, ` +
            `SignedHeaders=${signedHeaders}, ` +
            `Signature=${signature}`;

        const uploadUrl = `${this.endpoint}/${this.bucketName}/${key}`;

        const response = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': contentType,
                'x-amz-content-sha256': payloadHash,
                'x-amz-date': amzDate,
                'Authorization': authorizationHeader
            },
            body: bodyBytes
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Falha no upload para o Cloudflare R2 (HTTP ${response.status}): ${errText}`);
        }

        // Retorna a URL pública acessível para os clientes
        return `${this.publicUrl}/${key}`;
    }
}

// Instância global disponível
window.r2Storage = typeof r2Config !== 'undefined' ? new R2Storage(r2Config) : null;
