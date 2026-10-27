// ==========================================================================
// ESTADO GLOBAL DA APLICAÇÃO (SPA)
// ==========================================================================
let currentExtractedData = null;
let currentAnalysisData = null;

// ==========================================================================
// 1. INICIALIZAÇÃO & NAVEGAÇÃO SPA
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupSidebarToggle();
  setupExtractionFlow();
  setupPessoasCRUD();
  setupClassificacoesCRUD();
  setupContasPagarCRUD();
  setupContasReceberCRUD();
  setupDashboard();
  setupAuth();
  loadGitCommitInfo();

  // Carrega chave de API salva no localStorage
  const savedKey = localStorage.getItem('user_gemini_api_key');
  const apiKeyInput = document.getElementById('api-key-input');
  if (savedKey && apiKeyInput) {
    apiKeyInput.value = savedKey;
  }

  // Carrega dados iniciais do dashboard
  loadDashboardData();
});

// Navegação entre seções
function setupNavigation() {
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const viewId = item.getAttribute('data-view');
      navigateTo(viewId);
    });
  });

  // Suporte a hash na URL
  const hash = window.location.hash.replace('#', '');
  if (hash) {
    navigateTo(hash);
  }
}

window.navigateTo = function(viewId) {
  const targetView = document.getElementById(`view-${viewId}`);
  if (!targetView) return;

  // Atualiza views
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  targetView.classList.add('active');

  // Atualiza sidebar
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-view') === viewId);
  });

  // Atualiza breadcrumb
  const labels = {
    'dashboard': 'Dashboard',
    'extracao': 'Extração de NF-e com IA',
    'pessoas': 'Manter Pessoas',
    'classificacoes': 'Manter Classificações',
    'contas-pagar': 'Contas a Pagar',
    'contas-receber': 'Contas a Receber'
  };
  const breadcrumbEl = document.getElementById('breadcrumb-current');
  if (breadcrumbEl) {
    breadcrumbEl.textContent = labels[viewId] || 'Página';
  }

  window.location.hash = viewId;

  // Fecha sidebar mobile se aberta
  const sidebar = document.getElementById('sidebar');
  if (sidebar && sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
  }

  // Se navegou para o dashboard, atualiza os dados
  if (viewId === 'dashboard') {
    loadDashboardData();
  }
};

function setupSidebarToggle() {
  const btnToggle = document.getElementById('btn-toggle-sidebar');
  const sidebar = document.getElementById('sidebar');
  if (btnToggle && sidebar) {
    btnToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }
}

// ==========================================================================
// 2. FLUXO N2: EXTRAÇÃO DE NOTA FISCAL + ANÁLISE DE BD + LANÇAMENTO
// ==========================================================================
function setupExtractionFlow() {
  const apiKeyInput = document.getElementById('api-key-input');
  const btnToggleKey = document.getElementById('btn-toggle-key');
  const pdfInput = document.getElementById('pdf-input');
  const fileInputText = document.getElementById('file-input-text');
  const fileSelectedBox = document.getElementById('file-selected-box');
  const fileNameDisplay = document.getElementById('file-name-display');
  const fileSizeDisplay = document.getElementById('file-size-display');
  const btnExtract = document.getElementById('btn-extract');
  const btnExtractText = document.getElementById('btn-extract-text');
  const resultCard = document.getElementById('result-card');
  const analysisCard = document.getElementById('analysis-card');
  const btnLancarNota = document.getElementById('btn-lancar-nota');
  const btnCopy = document.getElementById('btn-copy');

  // Toggle visibilidade da chave
  if (btnToggleKey && apiKeyInput) {
    btnToggleKey.addEventListener('click', () => {
      const isPass = apiKeyInput.type === 'password';
      apiKeyInput.type = isPass ? 'text' : 'password';
    });

    apiKeyInput.addEventListener('input', () => {
      localStorage.setItem('user_gemini_api_key', apiKeyInput.value.trim());
    });
  }

  // Seleção de arquivo
  pdfInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      fileInputText.textContent = file.name;
      fileNameDisplay.textContent = file.name;
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      fileSizeDisplay.textContent = `${sizeMB} MB`;
      fileSelectedBox.style.display = 'flex';
      btnExtract.disabled = false;
      btnExtract.classList.add('active');
    } else {
      fileInputText.textContent = 'Nenhum arquivo escolhido';
      fileSelectedBox.style.display = 'none';
      btnExtract.disabled = true;
      btnExtract.classList.remove('active');
    }
  });

  // Botão de Extração
  btnExtract.addEventListener('click', async () => {
    const file = pdfInput.files[0];
    const userApiKey = apiKeyInput.value.trim();

    if (!userApiKey) {
      alert('Por favor, informe sua Chave da API Gemini no campo no topo.');
      apiKeyInput.focus();
      return;
    }

    if (!file) {
      alert('Por favor, selecione um arquivo PDF de nota fiscal.');
      return;
    }

    btnExtractText.textContent = '1/2: EXTRAINDO DADOS COM IA...';
    btnExtract.disabled = true;
    analysisCard.style.display = 'none';
    resultCard.style.display = 'none';
    document.getElementById('success-launch-banner').style.display = 'none';

    try {
      const formData = new FormData();
      formData.append('pdf', file);
      formData.append('apiKey', userApiKey);

      // Passo 1: Extração com Gemini
      const resp = await fetch('/api/extrair-nota', {
        method: 'POST',
        body: formData
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || data.details || 'Erro ao extrair nota');
      }

      currentExtractedData = data;

      // Renderiza JSON e visualização formatada
      document.getElementById('json-code-output').textContent = JSON.stringify(data, null, 2);
      renderFormattedData(data);
      resultCard.style.display = 'block';

      // Passo 2 (2ª ETAPA): Análise no Banco de Dados
      btnExtractText.textContent = '2/2: CONSULTANDO BANCO DE DADOS...';
      await executarAnaliseBanco(data);

    } catch (err) {
      console.error(err);
      alert(`Erro: ${err.message}`);
    } finally {
      btnExtractText.textContent = 'EXTRAIR DADOS';
      btnExtract.disabled = false;
    }
  });

  // Ação de Lançamento no Banco (2ª Etapa)
  btnLancarNota.addEventListener('click', async () => {
    if (!currentExtractedData) {
      alert('Nenhum dado extraído disponível para lançamento.');
      return;
    }

    const btnLancarText = document.getElementById('btn-lancar-text');
    btnLancarText.textContent = 'LANÇANDO NO BANCO DE DADOS...';
    btnLancarNota.disabled = true;

    try {
      const resp = await fetch('/api/lancar-nota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentExtractedData)
      });

      const resData = await resp.json();
      if (!resp.ok) {
        throw new Error(resData.error || resData.details || 'Erro ao efetuar lançamento');
      }

      // Exibe banner de sucesso
      const successBanner = document.getElementById('success-launch-banner');
      const successTitle = document.getElementById('success-launch-title');
      const successDesc = document.getElementById('success-launch-desc');

      successTitle.textContent = resData.message || 'REGISTRO LANÇADO COM SUCESSO!';
      successDesc.innerHTML = `
        <strong>ID do Movimento:</strong> #${resData.detalhes?.idMovimento} | 
        <strong>Valor:</strong> R$ ${(resData.detalhes?.valorTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | 
        <strong>Total de Parcelas:</strong> ${resData.detalhes?.totalParcelas}<br/>
        Entidades atualizadas: 
        ${resData.detalhes?.criados?.fornecedorNovo ? '<span class="badge-status-active">Novo Fornecedor Cadastrado</span> ' : ''}
        ${resData.detalhes?.criados?.faturadoNovo ? '<span class="badge-status-active">Novo Faturado Cadastrado</span> ' : ''}
        ${resData.detalhes?.criados?.despesaNova ? '<span class="badge-status-active">Nova Despesa Cadastrada</span> ' : ''}
      `;
      successBanner.style.display = 'flex';
      successBanner.scrollIntoView({ behavior: 'smooth' });

      // Atualiza dashboard
      loadDashboardData();

    } catch (err) {
      console.error(err);
      alert(`Falha no lançamento: ${err.message}`);
    } finally {
      btnLancarText.textContent = 'CRIAR ENTIDADES E LANÇAR MOVIMENTO NO BANCO';
      btnLancarNota.disabled = false;
    }
  });

  // Copiar JSON
  if (btnCopy) {
    btnCopy.addEventListener('click', async () => {
      const text = document.getElementById('json-code-output').textContent;
      if (!text) return;
      await navigator.clipboard.writeText(text);
      const copyText = document.getElementById('btn-copy-text');
      copyText.textContent = 'Copiado!';
      setTimeout(() => { copyText.textContent = 'Copiar JSON'; }, 2000);
    });
  }

  // Alternância de abas de resultado
  const tabButtons = document.querySelectorAll('.result-card .tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.result-card .tab-content').forEach(c => c.style.display = 'none');

      btn.classList.add('active');
      const target = document.getElementById(btn.getAttribute('data-target'));
      if (target) target.style.display = 'block';
    });
  });
}

// 2.1 Executa a análise de existência de Fornecedor, Faturado e Despesa
async function executarAnaliseBanco(data) {
  const analysisCard = document.getElementById('analysis-card');

  try {
    const resp = await fetch('/api/analisar-nota', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fornecedor: data.fornecedor,
        faturado: data.faturado,
        classificacaoDespesa: data.classificacaoDespesa
      })
    });

    const res = await resp.json();
    currentAnalysisData = res;

    // Atualiza FORNECEDOR
    document.getElementById('analise-forn-nome').textContent = res.fornecedor.razaoSocial || '-';
    document.getElementById('analise-forn-cnpj').textContent = res.fornecedor.cnpj || '-';
    const tagForn = document.getElementById('tag-fornecedor');
    const resForn = document.getElementById('analise-forn-res');
    tagForn.textContent = res.fornecedor.existe ? 'EXISTE' : 'NÃO EXISTE';
    tagForn.className = `status-tag ${res.fornecedor.existe ? 'exists' : 'not-exists'}`;
    resForn.textContent = res.fornecedor.texto;
    resForn.className = `entity-result-box ${res.fornecedor.existe ? 'exists' : 'not-exists'}`;

    // Atualiza FATURADO
    document.getElementById('analise-fat-nome').textContent = res.faturado.nomeCompleto || '-';
    document.getElementById('analise-fat-cpf').textContent = res.faturado.cpf || '-';
    const tagFat = document.getElementById('tag-faturado');
    const resFat = document.getElementById('analise-fat-res');
    tagFat.textContent = res.faturado.existe ? 'EXISTE' : 'NÃO EXISTE';
    tagFat.className = `status-tag ${res.faturado.existe ? 'exists' : 'not-exists'}`;
    resFat.textContent = res.faturado.texto;
    resFat.className = `entity-result-box ${res.faturado.existe ? 'exists' : 'not-exists'}`;

    // Atualiza DESPESA
    document.getElementById('analise-desp-nome').textContent = res.despesa.descricao || '-';
    const tagDesp = document.getElementById('tag-despesa');
    const resDesp = document.getElementById('analise-desp-res');
    tagDesp.textContent = res.despesa.existe ? 'EXISTE' : 'NÃO EXISTE';
    tagDesp.className = `status-tag ${res.despesa.existe ? 'exists' : 'not-exists'}`;
    resDesp.textContent = res.despesa.texto;
    resDesp.className = `entity-result-box ${res.despesa.existe ? 'exists' : 'not-exists'}`;

    // Exibe texto exato no padrão requerido pelo professor
    document.getElementById('relatorio-consulta-texto').textContent = res.relatorioTexto;

    // Exibe o card de análise
    analysisCard.style.display = 'block';
    analysisCard.scrollIntoView({ behavior: 'smooth' });

  } catch (err) {
    console.error('Erro na análise:', err);
    alert('Erro ao consultar banco de dados para verificação de entidades.');
  }
}

function renderFormattedData(data) {
  const produtos = Array.isArray(data.descricaoProdutos) && data.descricaoProdutos.length > 0
    ? data.descricaoProdutos.map((p, i) => `<li>• <strong>Item ${i+1}:</strong> ${p}</li>`).join('')
    : '<li>Nenhum produto discriminado.</li>';

  const container = document.getElementById('formatted-output');
  container.innerHTML = `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 16px;">
      <div><strong>Número da Nota:</strong> ${data.numeroNotaFiscal || '-'}</div>
      <div><strong>Emissão:</strong> ${data.dataEmissao || '-'}</div>
      <div><strong>Vencimento:</strong> ${data.dataVencimento || '-'}</div>
      <div><strong>Valor Total:</strong> R$ ${(data.valorTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
    </div>
    <div style="margin-bottom: 14px;">
      <strong>Classificação Sugerida:</strong> <span class="badge-role">${data.classificacaoDespesa || 'DESPESA GERAL'}</span>
    </div>
    <div>
      <strong>Produtos / Serviços:</strong>
      <ul style="list-style: none; padding-left: 0; margin-top: 6px; font-size: 0.88rem; color: #475569;">
        ${produtos}
      </ul>
    </div>
  `;
}

window.copiarTexto = function(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    navigator.clipboard.writeText(el.textContent);
    alert('Texto da consulta copiado para a área de transferência!');
  }
};

// ==========================================================================
// 3. MANTER PESSOAS (CRUD Completo com Inativação Lógica e Tabela Inicial Vazia)
// ==========================================================================
function setupPessoasCRUD() {
  const btnSearch = document.getElementById('btn-search-pessoas');
  const btnAll = document.getElementById('btn-all-pessoas');
  const searchInput = document.getElementById('search-pessoas-input');
  const searchTipo = document.getElementById('search-pessoas-tipo');
  const checkInativos = document.getElementById('check-pessoas-inativos');
  const btnOpenModal = document.getElementById('btn-open-modal-pessoa');
  const formPessoa = document.getElementById('form-pessoa');

  btnSearch.addEventListener('click', () => {
    carregarPessoas(searchInput.value.trim(), searchTipo.value, checkInativos.checked);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      carregarPessoas(searchInput.value.trim(), searchTipo.value, checkInativos.checked);
    }
  });

  // Botão TODOS (Carrega registros com status = 'ATIVO')
  btnAll.addEventListener('click', () => {
    searchInput.value = '';
    searchTipo.value = 'TODOS';
    checkInativos.checked = false;
    carregarPessoas('', 'TODOS', false);
  });

  checkInativos.addEventListener('change', () => {
    carregarPessoas(searchInput.value.trim(), searchTipo.value, checkInativos.checked);
  });

  // Abrir Modal de Cadastro (CREATE: status oculto == 'ATIVO')
  btnOpenModal.addEventListener('click', () => {
    document.getElementById('modal-pessoa-title').textContent = 'Novo Cadastro de Pessoa';
    document.getElementById('pessoa-id').value = '';
    document.getElementById('pessoa-status').value = 'ATIVO';
    formPessoa.reset();
    openModal('modal-pessoa');
  });

  // Submissão do Formulário
  formPessoa.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('pessoa-id').value;
    const payload = {
      tipo: document.getElementById('pessoa-tipo').value,
      cpfCnpj: document.getElementById('pessoa-cpfCnpj').value,
      razaoSocial: document.getElementById('pessoa-razaoSocial').value,
      nomeFantasia: document.getElementById('pessoa-nomeFantasia').value,
      telefone: document.getElementById('pessoa-telefone').value,
      email: document.getElementById('pessoa-email').value,
      endereco: document.getElementById('pessoa-endereco').value,
      status: document.getElementById('pessoa-status').value || 'ATIVO'
    };

    try {
      const url = id ? `/api/pessoas/${id}` : '/api/pessoas';
      const method = id ? 'PUT' : 'POST';

      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Erro ao salvar pessoa');
      }

      closeModal('modal-pessoa');
      alert(`Pessoa ${id ? 'atualizada' : 'cadastrada'} com sucesso!`);
      carregarPessoas(searchInput.value.trim(), searchTipo.value, checkInativos.checked);
      loadDashboardData();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  });
}

async function carregarPessoas(q = '', tipo = 'TODOS', incluirInativos = false) {
  const tbody = document.getElementById('table-pessoas-body');
  tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">Carregando dados...</td></tr>`;

  try {
    const statusParam = incluirInativos ? 'TODOS' : 'ATIVO';
    const params = new URLSearchParams({ q, tipo, status: statusParam });
    const resp = await fetch(`/api/pessoas?${params.toString()}`);
    const pessoas = await resp.json();

    if (!pessoas || pessoas.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">Nenhuma pessoa encontrada.</td></tr>`;
      return;
    }

    tbody.innerHTML = pessoas.map(p => `
      <tr class="${p.status === 'INATIVO' ? 'row-inactive' : ''}">
        <td><strong>${escapeHtml(p.razaoSocial)}</strong>${p.nomeFantasia ? `<br/><small class="text-muted">${escapeHtml(p.nomeFantasia)}</small>` : ''}</td>
        <td><span class="badge-role">${escapeHtml(p.tipo)}</span></td>
        <td class="font-mono">${escapeHtml(p.cpfCnpj)}</td>
        <td>${escapeHtml(p.telefone || '-')}</td>
        <td>${escapeHtml(p.email || '-')}</td>
        <td>
          <span class="${p.status === 'ATIVO' ? 'badge-status-active' : 'badge-status-inactive'}">
            ${p.status}
          </span>
        </td>
        <td class="text-center">
          <div class="row-actions">
            <button type="button" class="btn-action-edit" onclick="editarPessoa(${p.id})">Editar</button>
            ${p.status === 'ATIVO' 
              ? `<button type="button" class="btn-action-delete" title="Inativação Lógica" onclick="inativarPessoa(${p.id})">Inativar</button>`
              : `<button type="button" class="btn-action-reactivate" title="Reativar Registro" onclick="reativarPessoa(${p.id})">Reativar</button>`
            }
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell text-danger">Erro ao carregar pessoas.</td></tr>`;
  }
}

window.editarPessoa = async function(id) {
  try {
    const resp = await fetch(`/api/pessoas/${id}`);
    const p = await resp.json();

    document.getElementById('modal-pessoa-title').textContent = 'Editar Pessoa';
    document.getElementById('pessoa-id').value = p.id;
    document.getElementById('pessoa-status').value = p.status;
    document.getElementById('pessoa-tipo').value = p.tipo;
    document.getElementById('pessoa-cpfCnpj').value = p.cpfCnpj;
    document.getElementById('pessoa-razaoSocial').value = p.razaoSocial;
    document.getElementById('pessoa-nomeFantasia').value = p.nomeFantasia || '';
    document.getElementById('pessoa-telefone').value = p.telefone || '';
    document.getElementById('pessoa-email').value = p.email || '';
    document.getElementById('pessoa-endereco').value = p.endereco || '';

    openModal('modal-pessoa');
  } catch (err) {
    alert('Erro ao buscar dados da pessoa.');
  }
};

window.inativarPessoa = async function(id) {
  if (!confirm('Deseja realmente inativar este cadastro? (Exclusão Lógica: o registro poderá ser reativado)')) return;
  try {
    const resp = await fetch(`/api/pessoas/${id}`, { method: 'DELETE' });
    const res = await resp.json();
    alert(res.message || 'Cadastro inativado com sucesso.');
    document.getElementById('btn-search-pessoas').click();
    loadDashboardData();
  } catch (err) {
    alert('Erro ao inativar registro.');
  }
};

window.reativarPessoa = async function(id) {
  if (!confirm('Deseja reativar este cadastro?')) return;
  try {
    const resp = await fetch(`/api/pessoas/${id}/reativar`, { method: 'PATCH' });
    const res = await resp.json();
    alert(res.message || 'Cadastro reativado com sucesso!');
    document.getElementById('btn-search-pessoas').click();
    loadDashboardData();
  } catch (err) {
    alert('Erro ao reativar registro.');
  }
};

// ==========================================================================
// 4. MANTER CLASSIFICAÇÃO (CRUD de Tipos de Despesa e Receita)
// ==========================================================================
function setupClassificacoesCRUD() {
  const btnSearch = document.getElementById('btn-search-classif');
  const btnAll = document.getElementById('btn-all-classif');
  const searchInput = document.getElementById('search-classif-input');
  const searchTipo = document.getElementById('search-classif-tipo');
  const checkInativos = document.getElementById('check-classif-inativos');
  const btnOpenModal = document.getElementById('btn-open-modal-classif');
  const formClassif = document.getElementById('form-classif');

  btnSearch.addEventListener('click', () => {
    carregarClassificacoes(searchInput.value.trim(), searchTipo.value, checkInativos.checked);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') carregarClassificacoes(searchInput.value.trim(), searchTipo.value, checkInativos.checked);
  });

  btnAll.addEventListener('click', () => {
    searchInput.value = '';
    searchTipo.value = 'TODOS';
    checkInativos.checked = false;
    carregarClassificacoes('', 'TODOS', false);
  });

  checkInativos.addEventListener('change', () => {
    carregarClassificacoes(searchInput.value.trim(), searchTipo.value, checkInativos.checked);
  });

  btnOpenModal.addEventListener('click', () => {
    document.getElementById('modal-classif-title').textContent = 'Nova Classificação';
    document.getElementById('classif-id').value = '';
    document.getElementById('classif-status').value = 'ATIVO';
    formClassif.reset();
    openModal('modal-classif');
  });

  formClassif.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('classif-id').value;
    const payload = {
      tipo: document.getElementById('classif-tipo').value,
      descricao: document.getElementById('classif-descricao').value,
      status: document.getElementById('classif-status').value || 'ATIVO'
    };

    try {
      const url = id ? `/api/classificacoes/${id}` : '/api/classificacoes';
      const method = id ? 'PUT' : 'POST';
      const resp = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Erro ao salvar classificação');
      }
      closeModal('modal-classif');
      alert(`Classificação ${id ? 'atualizada' : 'cadastrada'} com sucesso!`);
      carregarClassificacoes(searchInput.value.trim(), searchTipo.value, checkInativos.checked);
      loadDashboardData();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  });
}

async function carregarClassificacoes(q = '', tipo = 'TODOS', incluirInativos = false) {
  const tbody = document.getElementById('table-classif-body');
  tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">Carregando classificações...</td></tr>`;

  try {
    const statusParam = incluirInativos ? 'TODOS' : 'ATIVO';
    const params = new URLSearchParams({ q, tipo, status: statusParam });
    const resp = await fetch(`/api/classificacoes?${params.toString()}`);
    const rows = await resp.json();

    if (!rows || rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">Nenhuma classificação encontrada.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(c => `
      <tr class="${c.status === 'INATIVO' ? 'row-inactive' : ''}">
        <td><strong>#${c.id}</strong></td>
        <td><span class="badge-role">${escapeHtml(c.tipo)}</span></td>
        <td><strong>${escapeHtml(c.descricao)}</strong></td>
        <td>
          <span class="${c.status === 'ATIVO' ? 'badge-status-active' : 'badge-status-inactive'}">
            ${c.status}
          </span>
        </td>
        <td class="text-center">
          <div class="row-actions">
            <button type="button" class="btn-action-edit" onclick="editarClassificacao(${c.id}, '${escapeHtml(c.tipo)}', '${escapeHtml(c.descricao)}', '${c.status}')">Editar</button>
            ${c.status === 'ATIVO'
              ? `<button type="button" class="btn-action-delete" onclick="inativarClassificacao(${c.id})">Inativar</button>`
              : `<button type="button" class="btn-action-reactivate" onclick="reativarClassificacao(${c.id})">Reativar</button>`
            }
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-cell text-danger">Erro ao consultar classificações.</td></tr>`;
  }
}

window.editarClassificacao = function(id, tipo, descricao, status) {
  document.getElementById('modal-classif-title').textContent = 'Editar Classificação';
  document.getElementById('classif-id').value = id;
  document.getElementById('classif-tipo').value = tipo;
  document.getElementById('classif-descricao').value = descricao;
  document.getElementById('classif-status').value = status;
  openModal('modal-classif');
};

window.inativarClassificacao = async function(id) {
  if (!confirm('Deseja inativar esta classificação?')) return;
  try {
    const resp = await fetch(`/api/classificacoes/${id}`, { method: 'DELETE' });
    const res = await resp.json();
    alert(res.message || 'Classificação inativada.');
    document.getElementById('btn-search-classif').click();
    loadDashboardData();
  } catch (err) {
    alert('Erro ao inativar.');
  }
};

window.reativarClassificacao = async function(id) {
  if (!confirm('Deseja reativar esta classificação?')) return;
  try {
    const resp = await fetch(`/api/classificacoes/${id}/reativar`, { method: 'PATCH' });
    const res = await resp.json();
    alert(res.message || 'Classificação reativada!');
    document.getElementById('btn-search-classif').click();
    loadDashboardData();
  } catch (err) {
    alert('Erro ao reativar.');
  }
};

// ==========================================================================
// 5. REGISTRAR CONTAS: CONTAS A PAGAR E CONTAS A RECEBER
// ==========================================================================
function setupContasPagarCRUD() {
  const btnSearch = document.getElementById('btn-search-pagar');
  const btnAll = document.getElementById('btn-all-pagar');
  const searchInput = document.getElementById('search-pagar-input');
  const checkInativos = document.getElementById('check-pagar-inativos');
  const btnOpenModal = document.getElementById('btn-open-modal-pagar');

  btnSearch.addEventListener('click', () => {
    carregarMovimentos('APAGAR', searchInput.value.trim(), checkInativos.checked, 'table-pagar-body');
  });

  btnAll.addEventListener('click', () => {
    searchInput.value = '';
    checkInativos.checked = false;
    carregarMovimentos('APAGAR', '', false, 'table-pagar-body');
  });

  checkInativos.addEventListener('change', () => {
    carregarMovimentos('APAGAR', searchInput.value.trim(), checkInativos.checked, 'table-pagar-body');
  });

  btnOpenModal.addEventListener('click', () => {
    abrirModalConta('APAGAR');
  });
}

function setupContasReceberCRUD() {
  const btnSearch = document.getElementById('btn-search-receber');
  const btnAll = document.getElementById('btn-all-receber');
  const searchInput = document.getElementById('search-receber-input');
  const checkInativos = document.getElementById('check-receber-inativos');
  const btnOpenModal = document.getElementById('btn-open-modal-receber');

  btnSearch.addEventListener('click', () => {
    carregarMovimentos('RECEBER', searchInput.value.trim(), checkInativos.checked, 'table-receber-body');
  });

  btnAll.addEventListener('click', () => {
    searchInput.value = '';
    checkInativos.checked = false;
    carregarMovimentos('RECEBER', '', false, 'table-receber-body');
  });

  checkInativos.addEventListener('change', () => {
    carregarMovimentos('RECEBER', searchInput.value.trim(), checkInativos.checked, 'table-receber-body');
  });

  btnOpenModal.addEventListener('click', () => {
    abrirModalConta('RECEBER');
  });

  // Listener para submissão do form-conta
  document.getElementById('form-conta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tipo = document.getElementById('conta-tipo').value;
    const selectedClassifs = Array.from(document.getElementById('conta-classificacao').selectedOptions).map(o => parseInt(o.value));

    const payload = {
      tipo,
      idPessoaFornecedor: parseInt(document.getElementById('conta-fornecedor').value),
      idPessoaFaturado: document.getElementById('conta-faturado').value ? parseInt(document.getElementById('conta-faturado').value) : null,
      numeroDocumento: document.getElementById('conta-numero').value.trim(),
      valorTotal: parseFloat(document.getElementById('conta-valor').value),
      dataEmissao: document.getElementById('conta-emissao').value,
      dataVencimento: document.getElementById('conta-vencimento').value,
      observacao: document.getElementById('conta-observacao').value.trim(),
      classificacoesIds: selectedClassifs
    };

    try {
      const resp = await fetch('/api/movimentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Erro ao registrar conta');
      }
      closeModal('modal-conta');
      alert('Conta registrada com sucesso!');
      if (tipo === 'APAGAR') {
        document.getElementById('btn-search-pagar').click();
      } else {
        document.getElementById('btn-search-receber').click();
      }
      loadDashboardData();
    } catch (err) {
      alert(`Erro: ${err.message}`);
    }
  });
}

async function carregarMovimentos(tipo, q, incluirInativos, tbodyId) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = `<tr><td colspan="9" class="empty-cell">Carregando registros...</td></tr>`;

  try {
    const statusParam = incluirInativos ? 'TODOS' : 'ATIVO';
    const params = new URLSearchParams({ tipo, q, status: statusParam });
    const resp = await fetch(`/api/movimentos?${params.toString()}`);
    const rows = await resp.json();

    if (!rows || rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9" class="empty-cell">Nenhum registro encontrado.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(m => {
      const valorFmt = (m.valorTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      const parcelasTooltip = (m.parcelas || []).map(p => `P${p.numeroParcela}: ${p.dataVencimento} (R$ ${p.valor.toFixed(2)}) - ${p.identificacao}`).join('&#013;');

      return `
        <tr class="${m.status === 'INATIVO' ? 'row-inactive' : ''}">
          <td><strong>${escapeHtml(m.numeroDocumento || `#${m.id}`)}</strong></td>
          <td>
            <strong>${escapeHtml(m.fornecedorNome || 'Não informado')}</strong>
            ${m.fornecedorCpfCnpj ? `<br/><small class="font-mono text-muted">${escapeHtml(m.fornecedorCpfCnpj)}</small>` : ''}
          </td>
          ${tipo === 'APAGAR' ? `
            <td>
              <strong>${escapeHtml(m.faturadoNome || '-')}</strong>
              ${m.faturadoCpfCnpj ? `<br/><small class="font-mono text-muted">${escapeHtml(m.faturadoCpfCnpj)}</small>` : ''}
            </td>
          ` : ''}
          <td><span class="badge-role">${escapeHtml(m.classificacoesNomes || 'Geral')}</span></td>
          <td title="${parcelasTooltip}">
            <span class="badge-status-active" style="cursor: help;">
              ${m.totalParcelas || 1} parcela(s)
            </span>
          </td>
          <td>${escapeHtml(m.dataVencimento || '-')}</td>
          <td><strong>R$ ${valorFmt}</strong></td>
          <td>
            <span class="${m.status === 'ATIVO' ? 'badge-status-active' : 'badge-status-inactive'}">
              ${m.status}
            </span>
          </td>
          <td class="text-center">
            <div class="row-actions">
              ${m.status === 'ATIVO'
                ? `<button type="button" class="btn-action-delete" onclick="inativarMovimento(${m.id}, '${tipo}')">Inativar</button>`
                : `<button type="button" class="btn-action-reactivate" onclick="reativarMovimento(${m.id}, '${tipo}')">Reativar</button>`
              }
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-cell text-danger">Erro ao consultar movimentos.</td></tr>`;
  }
}

async function abrirModalConta(tipo) {
  document.getElementById('conta-tipo').value = tipo;
  document.getElementById('modal-conta-title').textContent = tipo === 'APAGAR' ? 'Registrar Contas a Pagar' : 'Registrar Contas a Receber';
  document.getElementById('lbl-conta-fornecedor').textContent = tipo === 'APAGAR' ? 'Fornecedor (Emitente) *' : 'Cliente / Pagador *';
  document.getElementById('form-conta').reset();

  // Carrega Pessoas e Classificações para os selects
  try {
    const [resPessoas, resClassif] = await Promise.all([
      fetch('/api/pessoas?status=ATIVO').then(r => r.json()),
      fetch(`/api/classificacoes?status=ATIVO&tipo=${tipo === 'APAGAR' ? 'DESPESA' : 'RECEITA'}`).then(r => r.json())
    ]);

    const selectForn = document.getElementById('conta-fornecedor');
    const selectFat = document.getElementById('conta-faturado');
    const selectClassif = document.getElementById('conta-classificacao');

    selectForn.innerHTML = '<option value="">Selecione...</option>' + resPessoas.map(p => `
      <option value="${p.id}">${escapeHtml(p.razaoSocial)} (${p.tipo} - ${p.cpfCnpj})</option>
    `).join('');

    selectFat.innerHTML = '<option value="">Nenhum / Não aplicável</option>' + resPessoas.map(p => `
      <option value="${p.id}">${escapeHtml(p.razaoSocial)} (${p.cpfCnpj})</option>
    `).join('');

    selectClassif.innerHTML = resClassif.map(c => `
      <option value="${c.id}">${escapeHtml(c.descricao)}</option>
    `).join('');

    openModal('modal-conta');
  } catch (err) {
    alert('Erro ao carregar opções para o formulário.');
  }
}

window.inativarMovimento = async function(id, tipo) {
  if (!confirm('Deseja inativar este movimento e suas parcelas?')) return;
  try {
    const resp = await fetch(`/api/movimentos/${id}`, { method: 'DELETE' });
    const res = await resp.json();
    alert(res.message || 'Registro inativado.');
    if (tipo === 'APAGAR') document.getElementById('btn-search-pagar').click();
    else document.getElementById('btn-search-receber').click();
    loadDashboardData();
  } catch (err) {
    alert('Erro ao inativar.');
  }
};

window.reativarMovimento = async function(id, tipo) {
  if (!confirm('Deseja reativar este movimento?')) return;
  try {
    const resp = await fetch(`/api/movimentos/${id}/reativar`, { method: 'PATCH' });
    const res = await resp.json();
    alert(res.message || 'Registro reativado!');
    if (tipo === 'APAGAR') document.getElementById('btn-search-pagar').click();
    else document.getElementById('btn-search-receber').click();
    loadDashboardData();
  } catch (err) {
    alert('Erro ao reativar.');
  }
};

// ==========================================================================
// 6. DASHBOARD
// ==========================================================================
function setupDashboard() {
  const btnRefresh = document.getElementById('btn-refresh-dash');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', loadDashboardData);
  }
}

async function loadDashboardData() {
  try {
    const resp = await fetch('/api/dashboard');
    if (!resp.ok) return;
    const d = await resp.json();

    document.getElementById('dash-pessoas').textContent = d.pessoasAtivas || 0;
    document.getElementById('dash-classificacoes').textContent = d.classificacoes || 0;
    document.getElementById('dash-pagar-total').textContent = `R$ ${(d.contasPagarTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('dash-pagar-qtd').textContent = `${d.contasPagarQtd || 0} registro(s) ativo(s)`;
    document.getElementById('dash-receber-total').textContent = `R$ ${(d.contasReceberTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('dash-receber-qtd').textContent = `${d.contasReceberQtd || 0} registro(s) ativo(s)`;

    const tbody = document.getElementById('dash-recent-table');
    if (d.ultimosMovimentos && d.ultimosMovimentos.length > 0) {
      tbody.innerHTML = d.ultimosMovimentos.map(m => `
        <tr>
          <td>#${m.id}</td>
          <td><span class="badge-role">${m.tipo}</span></td>
          <td><strong>${escapeHtml(m.numeroDocumento || '-')}</strong></td>
          <td>${escapeHtml(m.fornecedorNome || '-')}</td>
          <td>${escapeHtml(m.faturadoNome || '-')}</td>
          <td>${escapeHtml(m.dataVencimento || '-')}</td>
          <td><strong>R$ ${(m.valorTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
          <td><span class="badge-status-active">${m.status}</span></td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">Nenhum movimento registrado ainda.</td></tr>`;
    }
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
  }
}

// ==========================================================================
// 7. AUTENTICAÇÃO (LOGIN / SENHA) & CÓDIGO DA ÚLTIMA ATUALIZAÇÃO GITHUB
// ==========================================================================
function setupAuth() {
  const formLogin = document.getElementById('form-login');
  const loginOverlay = document.getElementById('login-overlay');
  const btnLogout = document.querySelector('.btn-logout');

  // Verifica se o usuário já fez login na sessão
  const isLogged = sessionStorage.getItem('usuario_logado');
  if (!isLogged) {
    // Para facilitar a navegação inicial, se quiser exigir tela cheia:
    // loginOverlay.style.display = 'flex';
  }

  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const usuario = document.getElementById('login-usuario').value.trim();
      const senha = document.getElementById('login-senha').value.trim();

      try {
        const resp = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usuario, senha })
        });

        const resData = await resp.json();
        if (!resp.ok) {
          throw new Error(resData.error || 'Credenciais inválidas');
        }

        sessionStorage.setItem('usuario_logado', JSON.stringify(resData.usuario));
        loginOverlay.style.display = 'none';
        alert(`Bem-vindo ao sistema, ${resData.usuario.nome}!`);
      } catch (err) {
        alert(err.message);
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      if (confirm('Deseja sair da sua sessão?')) {
        sessionStorage.removeItem('usuario_logado');
        loginOverlay.style.display = 'flex';
      }
    });
  }
}

async function loadGitCommitInfo() {
  try {
    const resp = await fetch('/api/versao-git');
    if (!resp.ok) return;
    const data = await resp.json();

    const commitTop = document.getElementById('lbl-git-commit-top');
    const commitMain = document.getElementById('lbl-git-commit-main');
    const commitDate = document.getElementById('lbl-git-commit-date');
    const btnCopyCommit = document.getElementById('btn-copy-commit-hash');

    if (commitTop) commitTop.textContent = `Commit #${data.commit}`;
    if (commitMain) commitMain.textContent = `Commit #${data.commit}`;
    if (commitDate) commitDate.textContent = `Atualizado em: ${data.data}`;

    if (btnCopyCommit) {
      btnCopyCommit.addEventListener('click', () => {
        navigator.clipboard.writeText(data.commitCompleto || data.commit);
        btnCopyCommit.textContent = 'Copiado!';
        setTimeout(() => { btnCopyCommit.textContent = 'Copiar Hash'; }, 2000);
      });
    }
  } catch (e) {
    console.warn('Não foi possível obter commit git:', e);
  }
}

// ==========================================================================
// HELPERS
// ==========================================================================
window.openModal = function(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('active');
};

window.closeModal = function(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('active');
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
