/**
 * admin.js - Controle do Lado de Administração para Samantha Catálogo
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Referências do DOM - Formulário
    const productForm = document.getElementById('productForm');
    const formTitle = document.getElementById('formTitle');
    const btnSubmitForm = document.getElementById('btnSubmitForm');
    const btnCancelEdit = document.getElementById('btnCancelEdit');
    const btnNewProduct = document.getElementById('btnNewProduct');
    
    const prodId = document.getElementById('prodId');
    const prodName = document.getElementById('prodName');
    const prodCategory = document.getElementById('prodCategory');
    const prodCode = document.getElementById('prodCode');
    const prodRef = document.getElementById('prodRef');
    const prodPrice = document.getElementById('prodPrice');
    const prodDescription = document.getElementById('prodDescription');
    const prodStatus = document.getElementById('prodStatus');

    // Referências do DOM - Categorias
    const btnManageCategories = document.getElementById('btnManageCategories');
    const categoriesModal = document.getElementById('categoriesModal');
    const closeCategoriesModalBtn = document.getElementById('closeCategoriesModalBtn');
    const categoryForm = document.getElementById('categoryForm');
    const catId = document.getElementById('catId');
    const catName = document.getElementById('catName');
    const btnSubmitCategory = document.getElementById('btnSubmitCategory');
    const btnCancelCategoryEdit = document.getElementById('btnCancelCategoryEdit');
    const categoriesList = document.getElementById('categoriesList');

    // Referências do DOM - Imagem
    const tabUpload = document.getElementById('tabUpload');
    const tabLink = document.getElementById('tabLink');
    const contentUpload = document.getElementById('contentUpload');
    const contentLink = document.getElementById('contentLink');
    const prodFile = document.getElementById('prodFile');
    const prodLink = document.getElementById('prodLink');
    const imagePreview = document.getElementById('imagePreview');
    const btnRemoveImage = document.getElementById('btnRemoveImage');

    // Referências do DOM - Listagem
    const adminSearchInput = document.getElementById('adminSearchInput');
    const adminProductsBody = document.getElementById('adminProductsBody');

    // Estado da imagem e lista
    let currentImage = ''; // Pode ser URL Base64 (upload) ou URL normal (link)
    let imageSourceType = 'upload'; // 'upload' ou 'link'
    let allProducts = [];

    // Inicialização
    try {
        if (!isFirebase) {
            // Em modo local (IndexedDB), exibe tudo imediatamente sem autenticação
            document.getElementById('adminAuthContainer').style.display = 'none';
            document.getElementById('adminPanelContent').style.display = 'flex';
            document.getElementById('adminUserEmail').textContent = 'Modo Local (Sem Login)';
            document.getElementById('btnAdminLogout').style.display = 'none';
            document.getElementById('btnManageCategories').style.display = 'inline-flex';
            await loadCategoriesList();
            await loadProductsList();
        } else {
            // Modo Firebase: Configura login
            setupFirebaseAuth();
        }
    } catch (err) {
        console.error('Erro na inicialização da página administrativa:', err);
    }

    // Configuração da autenticação no Firebase
    function setupFirebaseAuth() {
        const adminAuthContainer = document.getElementById('adminAuthContainer');
        const adminPanelContent = document.getElementById('adminPanelContent');
        const adminUserEmail = document.getElementById('adminUserEmail');
        const authErrorMessage = document.getElementById('authErrorMessage');
        const btnGoogleLogin = document.getElementById('btnGoogleLogin');
        const btnAdminLogout = document.getElementById('btnAdminLogout');

        // Botão de login com popup do Google
        btnGoogleLogin.addEventListener('click', async () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            authErrorMessage.style.display = 'none';
            try {
                await firebase.auth().signInWithPopup(provider);
            } catch (err) {
                console.error('Erro ao fazer login com Google:', err);
                authErrorMessage.textContent = 'Erro de autenticação: ' + (err.message || 'tente novamente.');
                authErrorMessage.style.display = 'block';
            }
        });

        // Botão de logout
        btnAdminLogout.addEventListener('click', async () => {
            try {
                await firebase.auth().signOut();
            } catch (err) {
                console.error('Erro ao sair:', err);
            }
        });

        // Observa alterações no estado de login
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                // Emails permitidos para administração
                const allowedEmails = ['edenirm@gmail.com', 'atacadofacilita21@gmail.com'];
                if (user.email && allowedEmails.includes(user.email.toLowerCase())) {
                    adminUserEmail.textContent = user.email;
                    adminAuthContainer.style.display = 'none';
                    adminPanelContent.style.display = 'flex';
                    btnAdminLogout.style.display = 'inline-flex';
                    document.getElementById('btnManageCategories').style.display = 'inline-flex';
                    authErrorMessage.style.display = 'none';
                    
                    // Carrega lista após confirmação de login
                    await loadCategoriesList();
                    await loadProductsList();
                } else {
                    // Email não autorizado: exibe aviso e desloga após 3.5 segundos
                    authErrorMessage.textContent = `Acesso negado: O email ${user.email} não possui permissão de administrador.`;
                    authErrorMessage.style.display = 'block';
                    
                    setTimeout(() => {
                        firebase.auth().signOut();
                    }, 3500);
                }
            } else {
                // Deslogado: esconde painel e mostra tela de login
                adminUserEmail.textContent = '';
                adminPanelContent.style.display = 'none';
                adminAuthContainer.style.display = 'flex';
            }
        });
    }

    // --- LOGICA DE TABS DE IMAGEM ---
    tabUpload.addEventListener('click', () => {
        tabUpload.classList.add('active');
        tabLink.classList.remove('active');
        contentUpload.classList.add('active');
        contentLink.classList.remove('active');
        imageSourceType = 'upload';
        
        // Se já tínhamos uma imagem por link e mudou de tab, limpamos se necessário,
        // ou deixamos o preview antigo caso ele exista.
    });

    tabLink.addEventListener('click', () => {
        tabLink.classList.add('active');
        tabUpload.classList.remove('active');
        contentLink.classList.add('active');
        contentUpload.classList.remove('active');
        imageSourceType = 'link';
    });

    // Evento de alteração de arquivo (Upload)
    prodFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                // Comprime a imagem para WebP 800x800 com qualidade 80%
                const base64Image = await compressImage(file);
                setProductImage(base64Image);
            } catch (err) {
                alert('Erro ao processar imagem. Certifique-se de enviar um arquivo válido.');
                console.error(err);
            }
        }
    });

    // Evento de alteração de URL (Link)
    prodLink.addEventListener('input', () => {
        const url = prodLink.value.trim();
        if (url) {
            setProductImage(url);
        } else {
            clearProductImage();
        }
    });

    // Botão remover imagem
    btnRemoveImage.addEventListener('click', () => {
        clearProductImage();
    });

    function setProductImage(src) {
        currentImage = src;
        imagePreview.src = src;
        imagePreview.style.display = 'block';
        btnRemoveImage.style.display = 'block';
    }

    function clearProductImage() {
        currentImage = '';
        imagePreview.src = '';
        imagePreview.style.display = 'none';
        btnRemoveImage.style.display = 'none';
        prodFile.value = '';
        prodLink.value = '';
    }

    // --- CARREGAR PRODUTOS NA TABELA ---
    async function loadProductsList() {
        allProducts = await getAllProducts();
        renderAdminProducts();
    }

    function renderAdminProducts() {
        const query = adminSearchInput.value.toLowerCase().trim();
        
        // Filtragem para a listagem admin (mostra ativos e inativos)
        let filtered = allProducts;
        if (query) {
            filtered = allProducts.filter(p => 
                (p.nome && p.nome.toLowerCase().includes(query)) ||
                (p.codigo && p.codigo.toLowerCase().includes(query)) ||
                (p.referencia && p.referencia.toLowerCase().includes(query)) ||
                (p.descricao && p.descricao.toLowerCase().includes(query))
            );
        }

        adminProductsBody.innerHTML = '';

        if (filtered.length === 0) {
            adminProductsBody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                        Nenhum produto cadastrado ou encontrado.
                    </td>
                </tr>
            `;
            return;
        }

        // Ordena por data de cadastro decrescente (mais novos primeiro)
        filtered.sort((a, b) => {
            const dateA = a.dataCadastro ? new Date(a.dataCadastro) : 0;
            const dateB = b.dataCadastro ? new Date(b.dataCadastro) : 0;
            return dateB - dateA;
        });

        filtered.forEach(produto => {
            const tr = document.createElement('tr');
            
            const displayTitle = produto.nome || (parseProductText(produto.descricao).title);
            const imgSrc = produto.imagem || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="%23cbd5e1" stroke-width="1"><rect width="24" height="24" rx="2"/></svg>';
            const isActive = produto.status === 'ativo';
            const cat = categories.find(c => String(c.id) === String(produto.categoriaId));
            const catNameText = cat ? cat.nome : 'Sem Categoria';

            tr.innerHTML = `
                <td>
                    <div class="table-product-info">
                        <img src="${imgSrc}" alt="${displayTitle}" loading="lazy">
                        <div class="table-product-details">
                            <span class="table-product-desc" title="${produto.descricao || ''}">${displayTitle}</span>
                            <span class="table-product-code">COD: ${produto.codigo || 'S/C'} | REF: ${produto.referencia || 'S/R'} | Cat: ${catNameText}</span>
                        </div>
                    </div>
                </td>
                <td>R$ ${produto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style="text-align: center;">
                    <label class="switch">
                        <input type="checkbox" class="toggle-status-chk" data-id="${produto.id}" ${isActive ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </td>
                <td>
                    <div class="actions-cell">
                        <button class="btn btn-secondary btn-sm btn-edit" data-id="${produto.id}">
                            Editar
                        </button>
                        <button class="btn btn-danger btn-sm btn-delete" data-id="${produto.id}">
                            Excluir
                        </button>
                    </div>
                </td>
            `;

            // Vincular evento de toggle de status diretamente
            const toggleChk = tr.querySelector('.toggle-status-chk');
            toggleChk.addEventListener('change', async (e) => {
                const id = e.target.dataset.id;
                const newStatus = e.target.checked ? 'ativo' : 'inativo';
                await toggleProductStatus(id, newStatus);
            });

            // Vincular evento de editar
            const btnEdit = tr.querySelector('.btn-edit');
            btnEdit.addEventListener('click', () => {
                editProduct(produto.id);
            });

            // Vincular evento de excluir
            const btnDelete = tr.querySelector('.btn-delete');
            btnDelete.addEventListener('click', () => {
                deleteProductConfirm(produto.id);
            });

            adminProductsBody.appendChild(tr);
        });
    }

    // Auxiliar: Extrai o título e descrição amigável
    function parseProductText(fullDesc) {
        if (!fullDesc) return { title: 'Sem descrição' };
        const parts = fullDesc.split(/\s+-\s+/);
        return {
            title: parts[0].trim()
        };
    }

    // Rápido Toggle de Status na tabela
    async function toggleProductStatus(id, status) {
        try {
            const product = await getProductById(id);
            if (product) {
                product.status = status;
                await updateProduct(product);
                // Atualizar cache local (compara como string para abranger ids Firebase/IndexedDB)
                const idx = allProducts.findIndex(p => String(p.id) === String(id));
                if (idx !== -1) {
                    allProducts[idx].status = status;
                }
                console.log(`Status do produto ${id} alterado para ${status}`);
            }
        } catch (err) {
            alert('Erro ao atualizar status do produto.');
            console.error(err);
            loadProductsList(); // Recarrega para voltar o estado anterior no checkbox
        }
    }

    // --- ADICIONAR E EDITAR PRODUTO ---
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const idValue = prodId.value;
        const nome = prodName.value.trim();
        const categoriaId = prodCategory.value;
        const codigo = prodCode.value.trim();
        const referencia = prodRef.value.trim();
        const preco = parseFloat(prodPrice.value);
        const descricao = prodDescription.value.trim();
        const status = prodStatus.checked ? 'ativo' : 'inativo';

        const produtoData = {
            nome,
            categoriaId,
            codigo,
            referencia,
            preco,
            descricao,
            status,
            imagem: currentImage
        };

        try {
            if (idValue) {
                // Atualizar produto existente (o db.js se encarrega de tratar o tipo do ID)
                produtoData.id = idValue;
                await updateProduct(produtoData);
                alert('Produto atualizado com sucesso!');
            } else {
                // Cadastrar novo produto
                await addProduct(produtoData);
                alert('Produto cadastrado com sucesso!');
            }

            resetForm();
            await loadProductsList();
        } catch (err) {
            alert('Erro ao salvar o produto no banco de dados.');
            console.error(err);
        }
    });

    // Carrega produto no formulário para edição
    async function editProduct(id) {
        try {
            const produto = await getProductById(id);
            if (produto) {
                prodId.value = produto.id;
                prodName.value = produto.nome || '';
                prodCategory.value = produto.categoriaId || '';
                prodCode.value = produto.codigo || '';
                prodRef.value = produto.referencia || '';
                prodPrice.value = produto.preco || '';
                prodDescription.value = produto.descricao || '';
                prodStatus.checked = produto.status === 'ativo';

                if (produto.imagem) {
                    setProductImage(produto.imagem);
                    // Decide qual tab ativar dependendo da imagem
                    if (produto.imagem.startsWith('data:')) {
                        // É Base64/Blob, então foi upload
                        tabUpload.click();
                    } else {
                        // É um link externo
                        tabLink.click();
                        prodLink.value = produto.imagem;
                    }
                } else {
                    clearProductImage();
                }

                // Ajustar interface
                formTitle.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    <span>Editar Produto</span>
                `;
                btnSubmitForm.textContent = 'Salvar Alterações';
                btnCancelEdit.style.display = 'block';
                btnNewProduct.style.display = 'block';
                
                // Scroll suave para o formulário
                document.querySelector('.admin-form-sticky').scrollIntoView({ behavior: 'smooth' });
            }
        } catch (err) {
            alert('Erro ao obter detalhes do produto.');
            console.error(err);
        }
    }

    // Excluir Produto
    async function deleteProductConfirm(id) {
        if (confirm('Tem certeza que deseja excluir permanentemente este produto do catálogo?')) {
            try {
                await deleteProduct(id);
                alert('Produto excluído com sucesso!');
                
                // Se o produto que estávamos editando foi excluído, resetamos o form
                if (prodId.value === String(id)) {
                    resetForm();
                }

                await loadProductsList();
            } catch (err) {
                alert('Erro ao excluir produto.');
                console.error(err);
            }
        }
    }

    // Cancelar Edição
    btnCancelEdit.addEventListener('click', resetForm);
    btnNewProduct.addEventListener('click', resetForm);

    function resetForm() {
        productForm.reset();
        prodId.value = '';
        prodCategory.value = '';
        clearProductImage();
        
        // Resetar interface
        formTitle.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            <span>Cadastrar Produto</span>
        `;
        btnSubmitForm.textContent = 'Cadastrar Produto';
        btnCancelEdit.style.display = 'none';
        btnNewProduct.style.display = 'none';
        
        // Ativar aba padrão
        tabUpload.click();
    }

    // Busca dinâmica na tabela admin
    adminSearchInput.addEventListener('input', renderAdminProducts);

    // ==========================================
    // LÓGICA E EVENTOS DE CATEGORIAS
    // ==========================================

    let categories = [];
    async function loadCategoriesList() {
        try {
            categories = await getAllCategories();
            categories.sort((a, b) => a.nome.localeCompare(b.nome));

            // Popular o select do produto
            const currentValue = prodCategory.value;
            prodCategory.innerHTML = '<option value="">Sem Categoria</option>';
            categories.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat.id;
                opt.textContent = cat.nome;
                prodCategory.appendChild(opt);
            });
            prodCategory.value = currentValue;

            // Renderizar no modal
            renderCategoriesModalList();
        } catch (err) {
            console.error('Erro ao carregar categorias:', err);
        }
    }

    function renderCategoriesModalList() {
        categoriesList.innerHTML = '';
        if (categories.length === 0) {
            categoriesList.innerHTML = '<li style="padding: 1rem; text-align: center; color: var(--text-muted);">Nenhuma categoria cadastrada.</li>';
            return;
        }

        categories.forEach(cat => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.padding = '0.75rem 1rem';
            li.style.borderBottom = '1px solid var(--border)';

            li.innerHTML = `
                <span style="font-weight: 500;">${cat.nome}</span>
                <div style="display: flex; gap: 0.25rem;">
                    <button class="btn btn-secondary btn-sm edit-cat-btn" data-id="${cat.id}" data-nome="${cat.nome}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Editar</button>
                    <button class="btn btn-danger btn-sm delete-cat-btn" data-id="${cat.id}" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Excluir</button>
                </div>
            `;

            // Eventos
            li.querySelector('.edit-cat-btn').addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                const nome = e.target.dataset.nome;
                editCategoryForm(id, nome);
            });

            li.querySelector('.delete-cat-btn').addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                confirmDeleteCategory(id);
            });

            categoriesList.appendChild(li);
        });
    }

    // Formulário de Categoria
    categoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = catId.value;
        const nome = catName.value.trim();

        if (!nome) return;

        try {
            if (id) {
                await updateCategory({ id, nome });
                alert('Categoria atualizada com sucesso!');
            } else {
                await addCategory({ nome });
                alert('Categoria cadastrada com sucesso!');
            }
            resetCategoryForm();
            await loadCategoriesList();
            await loadProductsList(); // Recarrega a tabela de produtos para atualizar nomes de categorias
        } catch (err) {
            alert('Erro ao salvar categoria.');
            console.error(err);
        }
    });

    function editCategoryForm(id, nome) {
        catId.value = id;
        catName.value = nome;
        btnSubmitCategory.textContent = 'Salvar';
        btnCancelCategoryEdit.style.display = 'block';
        catName.focus();
    }

    function resetCategoryForm() {
        catId.value = '';
        catName.value = '';
        btnSubmitCategory.textContent = 'Adicionar';
        btnCancelCategoryEdit.style.display = 'none';
    }

    btnCancelCategoryEdit.addEventListener('click', resetCategoryForm);

    async function confirmDeleteCategory(id) {
        if (confirm('Tem certeza que deseja excluir esta categoria? Os produtos desta categoria não serão excluídos, mas ficarão "Sem Categoria".')) {
            try {
                await deleteCategory(id);
                alert('Categoria excluída com sucesso!');
                await loadCategoriesList();
                await loadProductsList(); // Recarrega a tabela de produtos para atualizar nomes de categorias
            } catch (err) {
                alert('Erro ao excluir categoria.');
                console.error(err);
            }
        }
    }

    // Eventos de Abertura/Fechamento do Modal de Categorias
    btnManageCategories.addEventListener('click', () => {
        categoriesModal.classList.add('open');
        document.body.style.overflow = 'hidden';
    });

    function closeCategoriesModal() {
        categoriesModal.classList.remove('open');
        document.body.style.overflow = '';
        resetCategoryForm();
    }

    closeCategoriesModalBtn.addEventListener('click', closeCategoriesModal);
    categoriesModal.addEventListener('click', (e) => {
        if (e.target === categoriesModal) {
            closeCategoriesModal();
        }
    });
});
