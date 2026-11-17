// config.js - Configuração de credenciais do Firebase (Integrado Automaticamente)

const firebaseConfig = {
    apiKey: "AIzaSyB9s712JmCoOeJJCfn9GCV6e3ra9S3_-_k",
    authDomain: "samantha-catalogo-2026.firebaseapp.com",
    projectId: "samantha-catalogo-2026",
    storageBucket: "samantha-catalogo-2026.firebasestorage.app",
    messagingSenderId: "865785827881",
    appId: "1:865785827881:web:9c0b4b7af017f66999c238"
};

// Configuração do Cloudflare R2 Object Storage (via Worker autenticado)
const r2Config = {
    publicUrl: "https://pub-f95b17a1d5b746a7846b6e33f7055f52.r2.dev",
    workerUrl: "https://r2-upload-facilita.edenirm.workers.dev"
};
