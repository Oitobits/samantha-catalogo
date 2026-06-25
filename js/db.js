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
        
        // Exibe um pequeno indicador visual de modo online no console
        document.addEventListener('DOMContentLoaded', () => {
            showConnectionBadge(true);
        });
    } catch (error) {
        console.error('Erro ao inicializar Firebase. Usando IndexedDB local como fallback.', error);
        isFirebase = false;
        setupLocalFallback();
    }
} else {
    console.log('ℹ️ Firebase não configurado em config.js. Usando IndexedDB local.');
    setupLocalFallback();
}

function setupLocalFallback() {
    document.addEventListener('DOMContentLoaded', () => {
        showConnectionBadge(false);
    });
}

// Exibe um banner discreto informando o modo de conexão atual
function showConnectionBadge(online) {
    const badge = document.createElement('div');
    badge.style.position = 'fixed';
    badge.style.bottom = '1rem';
    badge.style.right = '1rem';
    badge.style.padding = '0.5rem 1rem';
    badge.style.borderRadius = '20px';
    badge.style.fontSize = '0.8rem';
    badge.style.fontWeight = '600';
    badge.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
    badge.style.zIndex = '9999';
    badge.style.display = 'flex';
    badge.style.alignItems = 'center';
    badge.style.gap = '0.5rem';

    if (online) {
        badge.style.backgroundColor = '#ecfdf5';
        badge.style.color = '#10b981';
        badge.style.border = '1px solid #a7f3d0';
        badge.innerHTML = `
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:#10b981;"></span>
            Nuvem Online (Firebase)
        `;
    } else {
        badge.style.backgroundColor = '#fffbeb';
        badge.style.color = '#d97706';
        badge.style.border = '1px solid #fde68a';
        badge.innerHTML = `
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:#d97706;"></span>
            Modo Local (IndexedDB)
        `;
    }
    document.body.appendChild(badge);
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

// Inicializa com dados demo caso o banco esteja vazio
async function initializeDemoProducts() {
    const produtos = await getAllProducts();
    if (produtos.length === 0) {
        console.log('Banco de dados vazio. Adicionando produtos de demonstração...');
        
        const placeholders = {
            bolsa: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 24 24" fill="none" stroke="%233b82f6" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="background:%23eff6ff"><rect x="3" y="8" width="18" height="13" rx="2" ry="2"/><path d="M16 8V6a4 4 0 0 0-8 0v2"/></svg>',
            sapato: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 24 24" fill="none" stroke="%23ec4899" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="background:%23fdf2f8"><path d="M3 21h18v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2z"/><path d="M12 11V3l4 4-4 4z"/></svg>',
            vestido: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 24 24" fill="none" stroke="%238b5cf6" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="background:%23f5f3ff"><path d="M6 3h12l3 6-4 12H7L3 9l3-6z"/></svg>',
            relogio: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 24 24" fill="none" stroke="%2310b981" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="background:%23ecfdf5"><circle cx="12" cy="12" r="7"/><polyline points="12 9 12 12 13.5 13.5"/><path d="M12 2v3M12 19v3M5 12H2M22 12h-3"/></svg>'
        };

        const demoData = [
            {
                codigo: 'BOL-001',
                referencia: 'REF-SAM-101',
                descricao: 'Bolsa de Couro Samantha Luxo - Alça transversal regulável, acabamento premium com costura reforçada e forro interno acetinado.',
                preco: 349.90,
                imagem: placeholders.bolsa,
                status: 'ativo'
            },
            {
                codigo: 'SAP-002',
                referencia: 'REF-SAM-202',
                descricao: 'Scarpin Salto Alto Verniz - Confortável, palmilha acolchoada, salto de 8cm, ideal para reuniões e eventos formais.',
                preco: 229.00,
                imagem: placeholders.sapato,
                status: 'ativo'
            },
            {
                codigo: 'VES-003',
                referencia: 'REF-SAM-303',
                descricao: 'Vestido Midi Canelado Elegance - Tecido com alta elasticidade, ótimo caimento, gola alta e fenda lateral sutil.',
                preco: 189.90,
                imagem: placeholders.vestido,
                status: 'ativo'
            },
            {
                codigo: 'REL-004',
                referencia: 'REF-SAM-404',
                descricao: 'Relógio Analógico Minimalist Gold - Caixa em aço inoxidável dourado, pulseira de couro legítimo e resistente a respingos d\'água.',
                preco: 450.00,
                imagem: placeholders.relogio,
                status: 'ativo'
            },
            {
                codigo: 'BOL-005',
                referencia: 'REF-SAM-105',
                descricao: 'Carteira Slim Porta-Cartões - Prática e compacta, compartimento para até 6 cartões e cédulas dobradas.',
                preco: 79.90,
                imagem: placeholders.bolsa,
                status: 'inativo'
            }
        ];

        for (const item of demoData) {
            await addProduct(item);
        }
        console.log('Produtos de demonstração carregados com sucesso no banco de dados ativo!');
    }
}
