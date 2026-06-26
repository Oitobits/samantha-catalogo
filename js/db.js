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
const DB_VERSION = 1;
const STORE_NAME = 'produtos';

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
        };
    });
}

// ==========================================
// FUNÇÕES DE CRUD GENERALIZADAS
// ==========================================

// Obter todos os produtos
async function getAllProducts() {
    if (isFirebase) {
        try {
            const snapshot = await dbFirestore.collection('produtos').get();
            const list = [];
            snapshot.forEach(doc => {
                list.push({ id: doc.id, ...doc.data() });
            });
            return list;
        } catch (err) {
            console.error('Erro ao ler dados do Firestore:', err);
            throw err;
        }
    } else {
        const db = await openIndexedDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

// Obter produto por ID
async function getProductById(id) {
    if (isFirebase) {
        try {
            const doc = await dbFirestore.collection('produtos').doc(String(id)).get();
            if (doc.exists) {
                return { id: doc.id, ...doc.data() };
            }
            return null;
        } catch (err) {
            console.error('Erro ao buscar produto no Firestore:', err);
            throw err;
        }
    } else {
        const db = await openIndexedDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(Number(id));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

// Adicionar produto
async function addProduct(produto) {
    produto.preco = parseFloat(produto.preco) || 0;
    produto.status = produto.status === 'ativo' ? 'ativo' : 'inativo';
    produto.dataCadastro = new Date().toISOString();

    if (isFirebase) {
        try {
            // Em vez de enviar para o Storage (que exige plano pago), salvamos a imagem
            // comprimida WebP em base64 direto no Firestore (cabe folgadamente no limite de 1MB)
            const docRef = await dbFirestore.collection('produtos').add(produto);
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

// Atualizar produto
async function updateProduct(produto) {
    produto.preco = parseFloat(produto.preco) || 0;
    produto.status = produto.status === 'ativo' ? 'ativo' : 'inativo';
    produto.dataAtualizacao = new Date().toISOString();

    if (isFirebase) {
        try {
            const docId = String(produto.id);
            const dadosSalvar = { ...produto };
            delete dadosSalvar.id;

            // Salva a imagem (seja base64 ou link externo) diretamente no Firestore
            await dbFirestore.collection('produtos').doc(docId).set(dadosSalvar);
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
            
            // Garante que o ID no IndexedDB seja numérico
            produto.id = Number(produto.id);
            
            const request = store.put(produto);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
}

// Excluir produto
async function deleteProduct(id) {
    if (isFirebase) {
        try {
            // Nota: Esta ação remove o produto do Firestore. 
            // Para manter o storage limpo, no mundo ideal removeríamos a imagem também, 
            // mas como é opcional e exige guardar o path da imagem, focar nos dados do Firestore é o suficiente.
            await dbFirestore.collection('produtos').doc(String(id)).delete();
            return true;
        } catch (err) {
            console.error('Erro ao excluir produto no Firestore:', err);
            throw err;
        }
    } else {
        const db = await openIndexedDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(Number(id));
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
}

// ==========================================
// FUNÇÕES AUXILIARES E DADOS DEMO
// ==========================================

// Função para redimensionar e comprimir imagens para WebP
function compressImage(file, maxWidth = 800, maxHeight = 800) {
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

                const compressedBase64 = canvas.toDataURL('image/webp', 0.8);
                resolve(compressedBase64);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}


