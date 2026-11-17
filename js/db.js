/**
 * db.js - Banco de Dados Local (IndexedDB) + Integração Firebase (Firestore/Storage)
 * 
 * Este arquivo detecta automaticamente se o Firebase foi configurado em js/config.js.
 * - Caso configurado: Salva os dados na nuvem (Firestore) e as imagens no Firebase Storage.
 * - Caso NÃO configurado: Mantém o funcionamento local offline usando o IndexedDB como fallback.
 */

// Estado da conexão
let isFirebase = false;
let dbFirestore = null;

// Verifica se as credenciais do Firebase foram inseridas pelo usuário
function checkFirebaseConfig() {
    if (typeof firebaseConfig !== 'undefined' && 
        firebaseConfig.apiKey && 
        firebaseConfig.apiKey !== 'SUA_API_KEY_AQUI' && 
        firebaseConfig.projectId && 
        firebaseConfig.projectId !== 'SEU_PROJECT_ID') {
        return true;
    }
    return false;
}

// Inicializa a conexão apropriada
if (checkFirebaseConfig()) {
    try {
        firebase.initializeApp(firebaseConfig);
        dbFirestore = firebase.firestore();
        isFirebase = true;
        console.log('🔥 Conectado com sucesso ao Firebase online.');
    } catch (error) {
        console.error('Erro ao inicializar Firebase. Usando IndexedDB local como fallback.', error);
        isFirebase = false;
    }
} else {
    console.log('ℹ️ Firebase não configurado em config.js. Usando IndexedDB local.');
}

// ==========================================
// CONFIGURAÇÃO DO INDEXEDDB (FALLBACK LOCAL)
// ==========================================
const DB_NAME = 'SamanthaCatalogoDB';
const DB_VERSION = 2;
const STORE_NAME = 'produtos';
const CATEGORIES_STORE = 'categorias';

function openIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = (e) => reject(e.target.error);
        request.onsuccess = (e) => resolve(e.target.result);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                store.createIndex('codigo', 'codigo', { unique: false });
                store.createIndex('status', 'status', { unique: false });
                store.createIndex('preco', 'preco', { unique: false });
            }
            if (!db.objectStoreNames.contains(CATEGORIES_STORE)) {
                db.createObjectStore(CATEGORIES_STORE, { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

// ==========================================
// UTILITÁRIOS DE SEGURANÇA E CACHE LOCAL
// ==========================================

// Sanitiza strings para evitar quebra de HTML / XSS em templates innerHTML
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Obter todos os produtos do cache local (execução instantânea ~10-50ms)
async function getCachedProducts() {
    try {
        const db = await openIndexedDB();
        return new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                const list = (request.result || []).filter(p => p && p.excluido !== true);
                resolve(list);
            };
            request.onerror = () => resolve([]);
        });
    } catch (err) {
        console.warn('Cache local IndexedDB não disponível:', err);
        return [];
    }
}

// Salvar múltiplos produtos em lote no cache local
async function saveProductsToCache(products) {
    if (!products || products.length === 0) return true;
    try {
        const db = await openIndexedDB();
        return new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            transaction.oncomplete = () => resolve(true);
            transaction.onerror = (e) => {
                console.warn('Aviso ao salvar no cache IndexedDB:', e.target ? e.target.error : e);
                resolve(false);
            };
            products.forEach(p => {
                if (p && p.id !== undefined && p.id !== null) {
                    try {
                        store.put(p);
                    } catch (err) {
                        console.warn('Erro ao salvar item no cache:', p.id, err);
                    }
                }
            });
        });
    } catch (err) {
        console.warn('Falha ao abrir IndexedDB para salvar produtos:', err);
        return false;
    }
}

// Salvar um único produto no cache local
async function saveSingleProductToCache(produto) {
    if (!produto || produto.id === undefined || produto.id === null) return false;
    try {
        const db = await openIndexedDB();
        return new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(produto);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    } catch (err) {
        console.warn('Falha ao atualizar produto no cache:', err);
        return false;
    }
}

// Remover produto do cache local
async function removeProductFromCache(id) {
    if (id === undefined || id === null) return false;
    try {
        const db = await openIndexedDB();
        return new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.delete(String(id));
            if (!isNaN(id)) {
                store.delete(Number(id));
            }
            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => resolve(false);
        });
    } catch (err) {
        console.warn('Falha ao remover produto do cache:', err);
        return false;
    }
}

// Lock para evitar sincronizações simultâneas concorrentes no IndexedDB
let activeSyncPromise = null;

// Subtrai margem de segurança (5 min) para evitar diferenças de relógio entre aparelhos
function getSafeSyncTimestamp(isoString) {
    if (!isoString) return null;
    const ms = Date.parse(isoString);
    if (isNaN(ms)) return null;
    return new Date(ms - 5 * 60 * 1000).toISOString();
}

// Aplica itens recebidos do delta-sync ao mapa e separa exclusões (soft-delete)
function applySyncedDocToMap(doc, map, recentItems, deletedIds) {
    const item = { id: doc.id, ...doc.data() };
    const idStr = String(doc.id);
    if (item.excluido === true) {
        map.delete(idStr);
        deletedIds.add(idStr);
    } else {
        map.set(idStr, item);
        if (!recentItems.some(r => String(r.id) === idStr)) {
            recentItems.push(item);
        }
    }
}

// Tenta baixar snapshot estático ultraleve do Cloudflare R2 (1 requisição ao invés de 5.000 leituras no Firestore)
async function tryLoadSnapshotFromR2() {
    if (typeof r2Config === 'undefined' || !r2Config.publicUrl) return null;
    try {
        const baseUrl = r2Config.publicUrl.replace(/\/+$/, '');
        const resp = await fetch(`${baseUrl}/catalogo.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (data && Array.isArray(data.produtos) && data.produtos.length > 0) {
            return {
                produtos: data.produtos.filter(p => p && p.excluido !== true),
                dataGeracao: data.dataGeracao || null
            };
        }
    } catch (e) {
        console.warn('Snapshot R2 indisponível, usando fallback direto do Firestore:', e.message);
    }
    return null;
}

// Sincronização inteligente com a nuvem (baixa o catálogo completo para o cache local)
async function syncProductsCache(onProgress = null, forceFull = false) {
    if (!isFirebase) {
        return await getCachedProducts();
    }

    if (activeSyncPromise && !forceFull) {
        return await activeSyncPromise;
    }

    const runSync = async () => {
        try {
            const cached = await getCachedProducts();
            
            // Se já temos um catálogo expressivo em cache (mais de 500 itens) e NÃO foi forçado completo:
            // Faz uma sincronização inteligente dos produtos adicionados, alterados ou excluídos recentemente
            if (cached.length >= 500 && !forceFull) {
                try {
                    const lastSyncTime = localStorage.getItem('samantha_last_sync_time');
                    const safeSyncTime = getSafeSyncTimestamp(lastSyncTime);
                    const recentItems = [];
                    const deletedIds = new Set();
                    const map = new Map();
                    cached.forEach(p => map.set(String(p.id), p));

                    // 1. Busca alterações desde a última sincronização (com margem de segurança de 5 min)
                    if (safeSyncTime) {
                        try {
                            const deltaSnap = await dbFirestore.collection('produtos')
                                .where('dataAtualizacao', '>=', safeSyncTime)
                                .get();
                            if (!deltaSnap.empty) {
                                deltaSnap.forEach(doc => applySyncedDocToMap(doc, map, recentItems, deletedIds));
                            }
                        } catch (deltaErr) {
                            console.warn('Busca delta por dataAtualizacao usará fallback ordenado:', deltaErr);
                        }
                    }

                    // 2. Busca os mais recentemente atualizados para garantir que qualquer edição/exclusão seja capturada
                    const orderSnap = await dbFirestore.collection('produtos')
                        .orderBy('dataAtualizacao', 'desc')
                        .limit(200)
                        .get();

                    if (!orderSnap.empty) {
                        orderSnap.forEach(doc => applySyncedDocToMap(doc, map, recentItems, deletedIds));
                    }

                    // 3. Busca também os mais recentemente criados (dataCadastro desc)
                    try {
                        const createSnap = await dbFirestore.collection('produtos')
                            .orderBy('dataCadastro', 'desc')
                            .limit(50)
                            .get();
                        if (!createSnap.empty) {
                            createSnap.forEach(doc => applySyncedDocToMap(doc, map, recentItems, deletedIds));
                        }
                    } catch (cErr) {
                        // Ignora caso campo não indexado
                    }

                    if (recentItems.length > 0) {
                        await saveProductsToCache(recentItems);
                    }
                    for (const delId of deletedIds) {
                        await removeProductFromCache(delId);
                    }
                    if (recentItems.length > 0 || deletedIds.size > 0) {
                        console.log(`⚡ Sincronizados ${recentItems.length} atualizados e ${deletedIds.size} removidos.`);
                    }

                    localStorage.setItem('samantha_last_sync_time', new Date().toISOString());
                    return Array.from(map.values());
                } catch (quickErr) {
                    console.warn('Aviso no delta-sync, usando cache existente:', quickErr);
                    return cached;
                }
            }

            // Cold Start (primeiro acesso) quando não é forceFull: tenta carregar snapshot leve do R2 primeiro
            if (!forceFull) {
                const snapshotR2 = await tryLoadSnapshotFromR2();
                if (snapshotR2 && snapshotR2.produtos.length > 0) {
                    console.log(`⚡ Snapshot carregado do Cloudflare R2: ${snapshotR2.produtos.length} produtos!`);
                    await saveProductsToCache(snapshotR2.produtos);
                    if (onProgress) onProgress(snapshotR2.produtos.length);

                    // Aplica eventuais alterações no Firestore posteriores à geração do snapshot
                    const map = new Map();
                    snapshotR2.produtos.forEach(p => map.set(String(p.id), p));
                    const safeSnapTime = getSafeSyncTimestamp(snapshotR2.dataGeracao);
                    if (safeSnapTime) {
                        try {
                            const recentItems = [];
                            const deletedIds = new Set();
                            const deltaSnap = await dbFirestore.collection('produtos')
                                .where('dataAtualizacao', '>=', safeSnapTime)
                                .get();
                            if (!deltaSnap.empty) {
                                deltaSnap.forEach(doc => applySyncedDocToMap(doc, map, recentItems, deletedIds));
                            }
                            if (recentItems.length > 0) await saveProductsToCache(recentItems);
                            for (const delId of deletedIds) await removeProductFromCache(delId);
                        } catch (deltaErr) {
                            console.warn('Aviso no delta pós-snapshot:', deltaErr);
                        }
                    }
                    localStorage.setItem('samantha_last_sync_time', new Date().toISOString());
                    return Array.from(map.values());
                }
            }

            // Fallback / Carga Completa: baixa os produtos do Firestore em fatias seguras (lotes de 150)
            console.log('🔄 Baixando catálogo do Firestore em lotes seguros para o cache local...');
            const all = [];
            let lastDoc = null;
            const batchSize = 150;
            let hasMore = true;

            while (hasMore) {
                let query = dbFirestore.collection('produtos').limit(batchSize);
                if (lastDoc) {
                    query = query.startAfter(lastDoc);
                }

                const snapshot = await query.get();
                if (snapshot.empty) {
                    hasMore = false;
                    break;
                }

                const batchList = [];
                snapshot.forEach(doc => {
                    const item = { id: doc.id, ...doc.data() };
                    if (item.excluido !== true) {
                        all.push(item);
                        batchList.push(item);
                    }
                });

                lastDoc = snapshot.docs[snapshot.docs.length - 1];
                if (batchList.length > 0) {
                    await saveProductsToCache(batchList);
                }

                if (onProgress) {
                    onProgress(all.length);
                }

                if (snapshot.size < batchSize) {
                    hasMore = false;
                }
            }
            
            localStorage.setItem('samantha_last_sync_time', new Date().toISOString());
            console.log(`✅ Catálogo completo recebido em lotes: ${all.length} produtos gravados no cache.`);
            return all;
        } catch (err) {
            console.error('Erro na sincronização de produtos:', err);
            const cachedFallback = await getCachedProducts();
            if (cachedFallback.length > 0) return cachedFallback;
            throw err;
        } finally {
            activeSyncPromise = null;
        }
    };

    activeSyncPromise = runSync();
    return await activeSyncPromise;
}

// ==========================================
// FUNÇÕES DE CRUD GENERALIZADAS
// ==========================================

// Obter todos os produtos (com limite opcional para carregamento rápido)
async function getAllProducts(limitVal = null) {
    if (isFirebase) {
        try {
            let query = dbFirestore.collection('produtos');
            if (limitVal) {
                query = query.limit(limitVal);
            }
            const snapshot = await query.get();
            const list = [];
            snapshot.forEach(doc => {
                const item = { id: doc.id, ...doc.data() };
                if (item.excluido !== true) {
                    list.push(item);
                }
            });
            // Só salva no cache se for a lista completa sem limite
            if (!limitVal && list.length > 0) {
                saveProductsToCache(list);
            }
            return list;
        } catch (err) {
            console.error('Erro ao ler dados do Firestore:', err);
            // Fallback para cache local se a rede falhar
            const cached = await getCachedProducts();
            if (cached && cached.length > 0) {
                return limitVal ? cached.slice(0, limitVal) : cached;
            }
            throw err;
        }
    } else {
        const cached = await getCachedProducts();
        return limitVal ? cached.slice(0, limitVal) : cached;
    }
}

// Obter produto por ID (com opção forceRemote para garantir dados frescos do Firestore)
async function getProductById(id, forceRemote = false) {
    if (isFirebase && forceRemote) {
        try {
            const doc = await dbFirestore.collection('produtos').doc(String(id)).get();
            if (doc.exists) {
                const item = { id: doc.id, ...doc.data() };
                saveSingleProductToCache(item);
                return item;
            }
            return null;
        } catch (err) {
            console.error('Erro ao buscar produto remoto no Firestore:', err);
        }
    }

    // 1. Tenta buscar no cache local primeiro (instantâneo ~1ms)
    try {
        const db = await openIndexedDB();
        const cachedItem = await new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const req = store.get(String(id));
            req.onsuccess = () => {
                if (req.result) resolve(req.result);
                else if (!isNaN(id)) {
                    const reqNum = store.get(Number(id));
                    reqNum.onsuccess = () => resolve(reqNum.result || null);
                    reqNum.onerror = () => resolve(null);
                } else {
                    resolve(null);
                }
            };
            req.onerror = () => resolve(null);
        });
        if (cachedItem) {
            return cachedItem;
        }
    } catch (e) {
        // Fallback silencioso para Firestore
    }

    if (isFirebase) {
        try {
            const doc = await dbFirestore.collection('produtos').doc(String(id)).get();
            if (doc.exists) {
                const item = { id: doc.id, ...doc.data() };
                saveSingleProductToCache(item);
                return item;
            }
            return null;
        } catch (err) {
            console.error('Erro ao buscar produto no Firestore:', err);
            throw err;
        }
    } else {
        return null;
    }
}

// Adicionar produto (Firestore + Cache Local)
async function addProduct(produto) {
    produto.preco = parseFloat(produto.preco) || 0;
    produto.status = produto.status === 'ativo' ? 'ativo' : 'inativo';
    produto.dataCadastro = new Date().toISOString();

    if (isFirebase) {
        try {
            const docRef = await dbFirestore.collection('produtos').add(produto);
            const savedItem = { id: docRef.id, ...produto };
            await saveSingleProductToCache(savedItem);
            return docRef.id;
        } catch (err) {
            console.error('Erro ao adicionar produto no Firestore:', err);
            throw err;
        }
    } else {
        const db = await openIndexedDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(produto);
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = () => reject(request.error);
        });
    }
}

// Atualizar produto (Firestore + Cache Local)
async function updateProduct(produto) {
    produto.preco = parseFloat(produto.preco) || 0;
    produto.status = produto.status === 'ativo' ? 'ativo' : 'inativo';
    produto.dataAtualizacao = new Date().toISOString();

    if (isFirebase) {
        try {
            const docId = String(produto.id);
            const dadosSalvar = { ...produto };
            delete dadosSalvar.id;

            await dbFirestore.collection('produtos').doc(docId).set(dadosSalvar);
            await saveSingleProductToCache({ id: docId, ...dadosSalvar });
            return true;
        } catch (err) {
            console.error('Erro ao atualizar produto no Firestore:', err);
            throw err;
        }
    } else {
        const db = await openIndexedDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            produto.id = !isNaN(produto.id) ? Number(produto.id) : produto.id;
            const request = store.put(produto);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
}

// Excluir produto (Soft-delete no Firestore para propagar remoção ao cache dos clientes)
async function deleteProduct(id) {
    if (isFirebase) {
        try {
            await dbFirestore.collection('produtos').doc(String(id)).set({
                excluido: true,
                status: 'inativo',
                dataAtualizacao: new Date().toISOString()
            }, { merge: true });
            await removeProductFromCache(id);
            return true;
        } catch (err) {
            console.error('Erro ao excluir produto no Firestore:', err);
            throw err;
        }
    } else {
        return await removeProductFromCache(id);
    }
}

// ==========================================
// FUNÇÕES AUXILIARES E DADOS DEMO
// ==========================================

// Função para redimensionar e comprimir imagens para WebP (foto de detalhe)
function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.75) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const compressedBase64 = canvas.toDataURL('image/webp', quality);
                resolve(compressedBase64);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

// Função para gerar miniatura ultraleve (Thumbnail 300x300, ~10-15 KB)
function generateThumbnail(file, maxSize = 300, quality = 0.65) {
    return compressImage(file, maxSize, maxSize, quality);
}

// Gera miniatura a partir de uma URL ou Base64 já existente
function generateThumbnailFromUrl(imageSrc, maxSize = 300, quality = 0.65) {
    return new Promise((resolve) => {
        if (!imageSrc) return resolve('');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = imageSrc;
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxSize) {
                        height = Math.round((height * maxSize) / width);
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = Math.round((width * maxSize) / height);
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const thumbBase64 = canvas.toDataURL('image/webp', quality);
                resolve(thumbBase64);
            } catch (e) {
                // Fallback seguro caso haja bloqueio de canvas
                resolve(imageSrc);
            }
        };
        img.onerror = () => resolve(imageSrc);
    });
}

// ==========================================
// FUNÇÕES DE CRUD DE CATEGORIAS
// ==========================================

// Obter todas as categorias
async function getAllCategories() {
    if (isFirebase) {
        try {
            const snapshot = await dbFirestore.collection('categorias').get();
            const list = [];
            snapshot.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() });
            });
            return list;
        } catch (err) {
            console.error('Erro ao ler categorias do Firestore:', err);
            throw err;
        }
    } else {
        const db = await openIndexedDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(CATEGORIES_STORE, 'readonly');
            const store = transaction.objectStore(CATEGORIES_STORE);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

// Adicionar categoria
async function addCategory(categoria) {
    categoria.dataCadastro = new Date().toISOString();
    if (isFirebase) {
        try {
            const docRef = await dbFirestore.collection('categorias').add(categoria);
            return docRef.id;
        } catch (err) {
            console.error('Erro ao adicionar categoria no Firestore:', err);
            throw err;
        }
    } else {
        const db = await openIndexedDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(CATEGORIES_STORE, 'readwrite');
            const store = transaction.objectStore(CATEGORIES_STORE);
            const request = store.add(categoria);
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = () => reject(request.error);
        });
    }
}

// Atualizar categoria
async function updateCategory(categoria) {
    categoria.dataAtualizacao = new Date().toISOString();
    if (isFirebase) {
        try {
            const docId = String(categoria.id);
            const dadosSalvar = { ...categoria };
            delete dadosSalvar.id;
            await dbFirestore.collection('categorias').doc(docId).set(dadosSalvar);
            return true;
        } catch (err) {
            console.error('Erro ao atualizar categoria no Firestore:', err);
            throw err;
        }
    } else {
        const db = await openIndexedDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(CATEGORIES_STORE, 'readwrite');
            const store = transaction.objectStore(CATEGORIES_STORE);
            categoria.id = Number(categoria.id);
            const dadosSalvar = { ...categoria };
            delete dadosSalvar.id;
            const request = store.put({ id: categoria.id, ...dadosSalvar });
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
}

// Excluir categoria
async function deleteCategory(id) {
    if (isFirebase) {
        try {
            await dbFirestore.collection('categorias').doc(String(id)).delete();
            return true;
        } catch (err) {
            console.error('Erro ao excluir categoria no Firestore:', err);
            throw err;
        }
    } else {
        const db = await openIndexedDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(CATEGORIES_STORE, 'readwrite');
            const store = transaction.objectStore(CATEGORIES_STORE);
            const request = store.delete(Number(id));
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
}


