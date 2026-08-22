/**
 * app.js - Lógica do Catálogo de Clientes para Samantha Catálogo
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Referências do DOM
    const productsContainer = document.getElementById('productsContainer');
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const categorySelect = document.getElementById('categorySelect');
    const btnLoadMore = document.getElementById('btnLoadMore');
    
    // Modal de Detalhes
    const detailsModal = document.getElementById('detailsModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const modalImage = document.getElementById('modalImage');
    const modalCode = document.getElementById('modalCode');
    const modalRef = document.getElementById('modalRef');
    const modalTitle = document.getElementById('modalTitle');
    const modalDescription = document.getElementById('modalDescription');
    const modalPrice = document.getElementById('modalPrice');

    // Controles do Carrinho no Modal
    const btnDecQty = document.getElementById('btnDecQty');
    const btnIncQty = document.getElementById('btnIncQty');
    const modalQtyInput = document.getElementById('modalQtyInput');
    const btnAddToCart = document.getElementById('btnAddToCart');
    const cartBadgeCount = document.getElementById('cartBadgeCount');

    // Estado local da aplicação
    let allProducts = [];
    let filteredProducts = [];
    let categories = [];
    let visibleCount = 16;
    let currentOpenedProduct = null;

    // Inicialização da base de dados e carregamento dos produtos
    try {
        await loadCatalog();
    } catch (error) {
        console.error('Falha ao inicializar o banco de dados:', error);
        productsContainer.innerHTML = `
            <div class="empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="red" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <h3>Erro no Banco de Dados</h3>
                <p>Não foi possível carregar o banco de dados local. Detalhes: ${error.message || error}</p>
            </div>
        `;
    }

    // Carrega dados da base de dados local
    async function loadCatalog() {
        try {
            // 1. Carregamento ultra rápido dos primeiros 32 produtos para exibição inicial imediata
            allProducts = await getAllProducts(32);
        } catch (err) {
            console.error('Erro no carregamento inicial de produtos:', err);
        }

        try {
            categories = await getAllCategories();
            categories.sort((a, b) => a.nome.localeCompare(b.nome));
        } catch (err) {
            console.error('Erro ao carregar categorias na vitrine:', err);
        }
        
        populateCategorySelect();
        applyFiltersAndSort();

        // 2. Carrega o restante do catálogo em segundo plano
        loadRemainingCatalogInBackground();
    }

    async function loadRemainingCatalogInBackground() {
        try {
            const fullList = await getAllProducts();
            allProducts = fullList;
            applyFiltersAndSort();
        } catch (err) {
            console.error('Erro no carregamento do catálogo em segundo plano:', err);
        }
    }

    // Popula o select de categorias no filtro
    function populateCategorySelect() {
        const currentValue = categorySelect.value;
        categorySelect.innerHTML = `
            <option value="all">Todas as Categorias</option>
            <option value="none">Outros (Sem Categoria)</option>
        `;
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.nome;
            categorySelect.appendChild(opt);
        });
        if (currentValue && categorySelect.querySelector(`option[value="${currentValue}"]`)) {
            categorySelect.value = currentValue;
        }
    }

    // Auxiliar: Extrai o título e a descrição amigável a partir da descrição cadastrada
    function parseProductText(fullDesc) {
        if (!fullDesc) return { title: 'Sem descrição', details: '' };
        
        // Se houver um traço " - ", tratamos o lado esquerdo como título e o direito como detalhes
        const parts = fullDesc.split(/\s+-\s+/);
        if (parts.length > 1) {
            return {
                title: parts[0].trim(),
                details: parts.slice(1).join(' - ').trim()
            };
        }
        
        // Caso contrário, pega as primeiras 4 palavras como título e o restante como detalhes
        const words = fullDesc.split(/\s+/);
        if (words.length > 5) {
            const title = words.slice(0, 4).join(' ');
            const details = words.slice(4).join(' ');
            return { title: title + '...', details: fullDesc };
        }
        
        return { title: fullDesc, details: fullDesc };
    }

    // Auxiliar: Retorna o título amigável do produto (usa campo nome ou fallback)
    function getProductTitle(produto) {
        return produto.nome || parseProductText(produto.descricao).title;
    }

    // Filtra e ordena os produtos baseado nas escolhas do usuário
    function applyFiltersAndSort() {
        const query = searchInput.value.toLowerCase().trim();
        const sortBy = sortSelect.value;
        const activeCategory = categorySelect.value;

        // 1. Filtrar ativos
        let result = allProducts.filter(p => p.status === 'ativo');

        // 1.5. Filtrar por categoria selecionada
        if (activeCategory === 'none') {
            result = result.filter(p => !p.categoriaId && (!p.categoriasIds || p.categoriasIds.length === 0));
        } else if (activeCategory !== 'all') {
            result = result.filter(p => 
                String(p.categoriaId) === activeCategory || 
                (p.categoriasIds && p.categoriasIds.map(String).includes(activeCategory))
            );
        }

        // 2. Aplicar busca por texto (nome, código, referência, descrição)
        if (query) {
            result = result.filter(p => 
                (p.nome && p.nome.toLowerCase().includes(query)) ||
                (p.codigo && p.codigo.toLowerCase().includes(query)) ||
                (p.referencia && p.referencia.toLowerCase().includes(query)) ||
                (p.descricao && p.descricao.toLowerCase().includes(query))
            );
        }

        // 3. Aplicar ordenação
        if (sortBy === 'price-asc') {
            result.sort((a, b) => a.preco - b.preco);
        } else if (sortBy === 'price-desc') {
            result.sort((a, b) => b.preco - a.preco);
        } else if (sortBy === 'alpha-asc') {
            result.sort((a, b) => {
                const titleA = getProductTitle(a).toLowerCase();
                const titleB = getProductTitle(b).toLowerCase();
                return titleA.localeCompare(titleB);
            });
        } else if (sortBy === 'alpha-desc') {
            result.sort((a, b) => {
                const titleA = getProductTitle(a).toLowerCase();
                const titleB = getProductTitle(b).toLowerCase();
                return titleB.localeCompare(titleA);
            });
        }

        filteredProducts = result;
        visibleCount = 16;
        renderProducts();
    }

    // Renderiza a lista de produtos na tela
    function renderProducts() {
        productsContainer.innerHTML = '';

        if (filteredProducts.length === 0) {
            productsContainer.innerHTML = `
                <div class="empty-state">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <h3>Nenhum produto encontrado</h3>
                    <p>Tente alterar os termos da busca ou ajustar a ordenação.</p>
                </div>
            `;
            if (btnLoadMore) btnLoadMore.style.display = 'none';
            return;
        }

        const itemsToShow = filteredProducts.slice(0, visibleCount);

        itemsToShow.forEach(produto => {
            const displayTitle = getProductTitle(produto);
            
            const card = document.createElement('div');
            card.className = 'product-card';
            card.dataset.id = produto.id;
            
            // Tratamento da imagem (se não houver, usa um placeholder SVG)
            const fallbackSrc = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 24 24" fill="none" stroke="%23cbd5e1" stroke-width="1" style="background:%23f8fafc"><rect width="24" height="24" rx="2"/></svg>';
            const imgs = produto.imagens && produto.imagens.length > 0 ? produto.imagens : (produto.imagem ? [produto.imagem] : [fallbackSrc]);
            let currentImgIdx = 0;
            const hasMultipleImages = imgs.length > 1;

            let arrowsHtml = '';
            let dotsHtml = '';
            if (hasMultipleImages) {
                arrowsHtml = `
                    <button type="button" class="slide-arrow slide-arrow-left">&lsaquo;</button>
                    <button type="button" class="slide-arrow slide-arrow-right">&rsaquo;</button>
                `;
                dotsHtml = `<div class="slide-dots">`;
                imgs.forEach((_, i) => {
                    dotsHtml += `<span class="slide-dot ${i === 0 ? 'active' : ''}"></span>`;
                });
                dotsHtml += `</div>`;
            }

            card.innerHTML = `
                <div class="product-image-container">
                    <img class="card-product-img" src="${imgs[0]}" alt="${displayTitle}" loading="lazy">
                    ${arrowsHtml}
                    ${dotsHtml}
                </div>
                <div class="product-info">
                    <div class="product-meta">
                        <span class="product-code">CÓD: ${produto.codigo || 'S/C'}</span>
                        <span class="product-ref">${produto.referencia || 'S/R'}</span>
                    </div>
                    <h3 class="product-desc" title="${displayTitle}">${displayTitle}</h3>
                    <div class="product-footer">
                        <span class="product-price">R$ ${produto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span class="badge badge-success" style="font-size: 0.7rem; font-weight: 500;">Disponível</span>
                    </div>
                </div>
            `;

            if (hasMultipleImages) {
                const imgElement = card.querySelector('.card-product-img');
                const btnLeft = card.querySelector('.slide-arrow-left');
                const btnRight = card.querySelector('.slide-arrow-right');
                const dots = card.querySelectorAll('.slide-dot');

                const updateCardSlide = (index) => {
                    currentImgIdx = index;
                    imgElement.src = imgs[currentImgIdx];
                    dots.forEach((dot, idx) => {
                        if (idx === currentImgIdx) {
                            dot.classList.add('active');
                        } else {
                            dot.classList.remove('active');
                        }
                    });
                };

                btnLeft.addEventListener('click', (e) => {
                    e.stopPropagation();
                    let newIdx = currentImgIdx - 1;
                    if (newIdx < 0) newIdx = imgs.length - 1;
                    updateCardSlide(newIdx);
                });

                btnRight.addEventListener('click', (e) => {
                    e.stopPropagation();
                    let newIdx = currentImgIdx + 1;
                    if (newIdx >= imgs.length) newIdx = 0;
                    updateCardSlide(newIdx);
                });
            }

            // Adiciona evento de clique para exibir detalhes no modal
            card.addEventListener('click', () => showProductDetails(produto));

            productsContainer.appendChild(card);
        });

        // Gerencia exibição do botão "Carregar Mais"
        if (btnLoadMore) {
            if (filteredProducts.length > visibleCount) {
                btnLoadMore.style.display = 'flex';
            } else {
                btnLoadMore.style.display = 'none';
            }
        }
    }

    // Abre o modal com os detalhes do produto
    function showProductDetails(produto) {
        currentOpenedProduct = produto;
        if (modalQtyInput) modalQtyInput.value = 1;
        const displayTitle = getProductTitle(produto);
        const displayDescription = produto.nome ? (produto.descricao || '') : (parseProductText(produto.descricao).details || produto.descricao || '');
        const fallbackSrc = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 24 24" fill="none" stroke="%23cbd5e1" stroke-width="1" style="background:%23f8fafc"><rect width="24" height="24" rx="2"/></svg>';
        const imgs = produto.imagens && produto.imagens.length > 0 ? produto.imagens : (produto.imagem ? [produto.imagem] : [fallbackSrc]);
        
        modalImage.src = imgs[0];
        modalImage.alt = displayTitle;
        modalCode.textContent = `Código: ${produto.codigo || 'Não informado'}`;
        modalRef.textContent = `Ref: ${produto.referencia || 'Não informado'}`;
        modalTitle.textContent = displayTitle;

        // Limpar qualquer controle de slide anterior no modal
        const imgContainer = document.querySelector('.modal-image-container');
        imgContainer.querySelectorAll('.slide-arrow, .slide-dots').forEach(el => el.remove());

        if (imgs.length > 1) {
            let modalImgIdx = 0;

            // Injetar setas
            const btnLeft = document.createElement('button');
            btnLeft.type = 'button';
            btnLeft.className = 'slide-arrow slide-arrow-left';
            btnLeft.innerHTML = '&lsaquo;';
            
            const btnRight = document.createElement('button');
            btnRight.type = 'button';
            btnRight.className = 'slide-arrow slide-arrow-right';
            btnRight.innerHTML = '&rsaquo;';

            // Injetar dots
            const dotsContainer = document.createElement('div');
            dotsContainer.className = 'slide-dots';
            imgs.forEach((_, i) => {
                const dot = document.createElement('span');
                dot.className = `slide-dot ${i === 0 ? 'active' : ''}`;
                dotsContainer.appendChild(dot);
            });

            imgContainer.appendChild(btnLeft);
            imgContainer.appendChild(btnRight);
            imgContainer.appendChild(dotsContainer);

            const modalDots = dotsContainer.querySelectorAll('.slide-dot');

            const updateModalSlide = (index) => {
                modalImgIdx = index;
                modalImage.src = imgs[modalImgIdx];
                modalDots.forEach((dot, idx) => {
                    if (idx === modalImgIdx) {
                        dot.classList.add('active');
                    } else {
                        dot.classList.remove('active');
                    }
                });
            };

            btnLeft.addEventListener('click', () => {
                let newIdx = modalImgIdx - 1;
                if (newIdx < 0) newIdx = imgs.length - 1;
                updateModalSlide(newIdx);
            });

            btnRight.addEventListener('click', () => {
                let newIdx = modalImgIdx + 1;
                if (newIdx >= imgs.length) newIdx = 0;
                updateModalSlide(newIdx);
            });
        }
        
        // Exibe ou esconde a descrição dependendo do conteúdo
        const descTitleElement = document.querySelector('.modal-desc-title');
        if (displayDescription) {
            modalDescription.textContent = displayDescription;
            modalDescription.style.display = 'block';
            if (descTitleElement) descTitleElement.style.display = 'block';
        } else {
            modalDescription.textContent = '';
            modalDescription.style.display = 'none';
            if (descTitleElement) descTitleElement.style.display = 'none';
        }
        
        modalPrice.textContent = `R$ ${produto.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        detailsModal.classList.add('open');
        document.body.style.overflow = 'hidden'; // Impede scroll do body
    }

    // Fecha o modal
    function closeModal() {
        detailsModal.classList.remove('open');
        document.body.style.overflow = '';
    }

    // Eventos
    searchInput.addEventListener('input', applyFiltersAndSort);
    sortSelect.addEventListener('change', applyFiltersAndSort);
    categorySelect.addEventListener('change', applyFiltersAndSort);
    closeModalBtn.addEventListener('click', closeModal);

    // Evento do botão Carregar Mais e Rolagem Infinita
    function loadMoreProducts() {
        visibleCount += 16;
        renderProducts();
    }

    if (btnLoadMore) {
        btnLoadMore.addEventListener('click', loadMoreProducts);
        
        // IntersectionObserver para rolagem infinita automática
        try {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting && filteredProducts.length > visibleCount) {
                        loadMoreProducts();
                    }
                });
            }, {
                rootMargin: '200px' // Carrega 200px antes de entrar na tela
            });
            observer.observe(btnLoadMore);
        } catch (e) {
            console.warn('IntersectionObserver não suportado:', e);
        }
    }

    // Fechar ao clicar fora do conteúdo do modal
    detailsModal.addEventListener('click', (e) => {
        if (e.target === detailsModal) {
            closeModal();
        }
    });

    // Fechar com a tecla ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && detailsModal.classList.contains('open')) {
            closeModal();
        }
    });

    // --- LOGICA DE QUANTIDADE E ADICIONAR AO CARRINHO ---
    if (btnDecQty && btnIncQty && modalQtyInput) {
        btnDecQty.addEventListener('click', () => {
            let val = parseInt(modalQtyInput.value) || 1;
            if (val > 1) {
                modalQtyInput.value = val - 1;
            }
        });

        btnIncQty.addEventListener('click', () => {
            let val = parseInt(modalQtyInput.value) || 1;
            modalQtyInput.value = val + 1;
        });
    }

    if (btnAddToCart) {
        btnAddToCart.addEventListener('click', () => {
            if (!currentOpenedProduct) return;
            const qty = parseInt(modalQtyInput.value) || 1;
            addToCart(currentOpenedProduct, qty);
        });
    }

    function addToCart(produto, quantidade) {
        let cart = [];
        try {
            cart = JSON.parse(localStorage.getItem('samantha_cart')) || [];
        } catch (e) {
            cart = [];
        }

        // Verifica se o produto já existe no carrinho
        const existingIdx = cart.findIndex(item => String(item.id) === String(produto.id));
        if (existingIdx !== -1) {
            cart[existingIdx].quantidade += quantidade;
        } else {
            // Salvar apenas os dados essenciais para o carrinho, NUNCA a imagem Base64 inteira
            cart.push({
                id: produto.id,
                nome: produto.nome || '',
                preco: produto.preco || 0,
                codigo: produto.codigo || '',
                referencia: produto.referencia || '',
                quantidade: quantidade
            });
        }

        localStorage.setItem('samantha_cart', JSON.stringify(cart));
        updateCartBadge();
        
        // Efeito visual no botão e fechar modal
        btnAddToCart.style.backgroundColor = '#10b981'; // Cor verde de sucesso
        btnAddToCart.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Adicionado!
        `;

        setTimeout(() => {
            btnAddToCart.style.backgroundColor = ''; // Restaura
            btnAddToCart.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
                Adicionar ao Carrinho
            `;
            closeModal();
        }, 800);
    }

    function updateCartBadge() {
        if (!cartBadgeCount) return;
        let cart = [];
        try {
            cart = JSON.parse(localStorage.getItem('samantha_cart')) || [];
        } catch (e) {
            cart = [];
        }
        
        const totalItems = cart.reduce((acc, item) => acc + (parseInt(item.quantidade) || 0), 0);
        cartBadgeCount.textContent = totalItems;
        
        // Oculta badge se carrinho estiver vazio
        if (totalItems > 0) {
            cartBadgeCount.style.display = 'flex';
        } else {
            cartBadgeCount.style.display = 'none';
        }
    }

    // Inicializa contador do carrinho
    updateCartBadge();
});
