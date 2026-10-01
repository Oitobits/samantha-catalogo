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
// FUNÇÕES DE CACHE LOCAL (INDEXEDDB ACELERADO)
// ==========================================

// Obter todos os produtos do cache local (execução instantânea ~10-50ms)
async function getCachedProducts() {
    try {
        const db = await openIndexedDB();
        return new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
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

// Sincronização inteligente com a nuvem (baixa o catálogo completo para o cache local)
async function syncProductsCache(onProgress = null, forceFull = false) {
    if (!isFirebase) {
        return await getCachedProducts();
    }

    try {
        const cached = await getCachedProducts();
        
        // Se já temos um catálogo expressivo em cache (mais de 500 itens) e NÃO foi forçado completo:
        // Faz uma verificação rápida dos mais recentes
        if (cached.length >= 500 && !forceFull) {
            try {
                let quickQuery = dbFirestore.collection('produtos').limit(100);
                const quickSnap = await quickQuery.get();
                if (!quickSnap.empty) {
                    const recentItems = [];
                    const map = new Map();
                    cached.forEach(p => map.set(String(p.id), p));
                    
                    quickSnap.forEach(doc => {
                        const item = { id: doc.id, ...doc.data() };
                        map.set(String(doc.id), item);
                        recentItems.push(item);
                    });
                    
                    await saveProductsToCache(recentItems);
                    const merged = Array.from(map.values());
                    return merged;
                }
            } catch (quickErr) {
                console.warn('Aviso no delta-sync, usando cache existente:', quickErr);
                return cached;
            }
            return cached;
        }

        // Caso o cache ainda não esteja completo (ex: primeiro acesso ou menos de 500 itens):
        // Baixa TODOS os produtos do Firestore
        console.log('🔄 Baixando catálogo completo do Firestore para o cache local...');
        const snapshot = await dbFirestore.collection('produtos').get();
        const all = [];
        snapshot.forEach(doc => {
            all.push({ id: doc.id, ...doc.data() });
        });
        
        console.log(`✅ Catálogo completo recebido: ${all.length} produtos. Gravando no cache local...`);
        await saveProductsToCache(all);
        if (onProgress) {
            onProgress(all.length);
        }
        return all;
    } catch (err) {
        console.error('Erro na sincronização de produtos:', err);
        const cachedFallback = await getCachedProducts();
        if (cachedFallback.length > 0) return cachedFallback;
        throw err;
    }
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
                list.push({ id: doc.id, ...doc.data() });
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

// Obter produto por ID (Cache-First para velocidade instantânea)
async function getProductById(id) {
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

// Excluir produto (Firestore + Cache Local)
async function deleteProduct(id) {
    if (isFirebase) {
        try {
            await dbFirestore.collection('produtos').doc(String(id)).delete();
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


