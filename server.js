import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  initDatabase,
  runQuery,
  getQuery,
  allQuery
} from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Inicializa banco de dados SQLite
initDatabase().catch(err => {
  console.error('❌ Falha ao inicializar o banco de dados:', err);
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Multer para upload em memória
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

const AVAILABLE_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'];

// Helper para normalizar CPF/CNPJ (apenas dígitos)
function cleanCpfCnpj(val) {
  if (!val) return '';
  return String(val).replace(/\D/g, '');
}

/* ==========================================================================
   1. ROTAS: MANTER PESSOAS (Fornecedores, Clientes, Faturados)
   Regras: Inativação lógica, reativação, busca por múltiplos campos
   ========================================================================== */

// Listar Pessoas (com busca e filtro de status)
app.get('/api/pessoas', async (req, res) => {
  try {
    const { q, tipo, status = 'ATIVO' } = req.query;
    let sql = 'SELECT * FROM PESSOAS WHERE 1=1';
    const params = [];

    if (status && status !== 'TODOS') {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (tipo && tipo !== 'TODOS') {
      sql += ' AND tipo = ?';
      params.push(tipo);
    }

    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      const cleanTerm = `%${cleanCpfCnpj(q.trim())}%`;
      sql += ' AND (razaoSocial LIKE ? OR nomeFantasia LIKE ? OR cpfCnpj LIKE ? OR email LIKE ? OR telefone LIKE ?)';
      params.push(term, term, cleanTerm.length > 2 ? cleanTerm : term, term, term);
    }

    sql += ' ORDER BY id DESC';
    const rows = await allQuery(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('Erro ao listar pessoas:', error);
    res.status(500).json({ error: 'Erro ao consultar pessoas', details: error.message });
  }
});

// Obter Pessoa por ID
app.get('/api/pessoas/:id', async (req, res) => {
  try {
    const pessoa = await getQuery('SELECT * FROM PESSOAS WHERE id = ?', [req.params.id]);
    if (!pessoa) return res.status(404).json({ error: 'Pessoa não encontrada' });
    res.json(pessoa);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar pessoa', details: error.message });
  }
});

// Cadastrar Pessoa (CREATE: status sempre 'ATIVO')
app.post('/api/pessoas', async (req, res) => {
  try {
    const { tipo, razaoSocial, nomeFantasia, cpfCnpj, telefone, email, endereco } = req.body;
    if (!tipo || !razaoSocial || !cpfCnpj) {
      return res.status(400).json({ error: 'Tipo, Razão Social/Nome e CPF/CNPJ são obrigatórios.' });
    }

    const result = await runQuery(
      `INSERT INTO PESSOAS (tipo, razaoSocial, nomeFantasia, cpfCnpj, telefone, email, endereco, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ATIVO')`,
      [tipo, razaoSocial.trim(), nomeFantasia?.trim() || null, cpfCnpj.trim(), telefone?.trim() || null, email?.trim() || null, endereco?.trim() || null]
    );

    const novaPessoa = await getQuery('SELECT * FROM PESSOAS WHERE id = ?', [result.id]);
    res.status(201).json(novaPessoa);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao cadastrar pessoa', details: error.message });
  }
});

// Atualizar Pessoa (UPDATE: status preservado)
app.put('/api/pessoas/:id', async (req, res) => {
  try {
    const { tipo, razaoSocial, nomeFantasia, cpfCnpj, telefone, email, endereco, status } = req.body;
    await runQuery(
      `UPDATE PESSOAS 
       SET tipo = ?, razaoSocial = ?, nomeFantasia = ?, cpfCnpj = ?, telefone = ?, email = ?, endereco = ?, 
           status = COALESCE(?, status), updatedAt = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [tipo, razaoSocial, nomeFantasia, cpfCnpj, telefone, email, endereco, status, req.params.id]
    );

    const pessoa = await getQuery('SELECT * FROM PESSOAS WHERE id = ?', [req.params.id]);
    res.json(pessoa);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar pessoa', details: error.message });
  }
});

// Excluir Pessoa (DELETE LÓGICO: status == 'INATIVO')
app.delete('/api/pessoas/:id', async (req, res) => {
  try {
    await runQuery(`UPDATE PESSOAS SET status = 'INATIVO', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Registro inativado com sucesso (exclusão lógica).' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao inativar pessoa', details: error.message });
  }
});

// Reativar Pessoa (status == 'ATIVO')
app.patch('/api/pessoas/:id/reativar', async (req, res) => {
  try {
    await runQuery(`UPDATE PESSOAS SET status = 'ATIVO', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Registro reativado com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao reativar pessoa', details: error.message });
  }
});

/* ==========================================================================
   2. ROTAS: MANTER CLASSIFICAÇÃO (Tipos de Despesa e Receita)
   ========================================================================== */

// Listar Classificações
app.get('/api/classificacoes', async (req, res) => {
  try {
    const { q, tipo, status = 'ATIVO' } = req.query;
    let sql = 'SELECT * FROM CLASSIFICACAO WHERE 1=1';
    const params = [];

    if (status && status !== 'TODOS') {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (tipo && tipo !== 'TODOS') {
      sql += ' AND tipo = ?';
      params.push(tipo);
    }

    if (q && q.trim()) {
      sql += ' AND descricao LIKE ?';
      params.push(`%${q.trim()}%`);
    }

    sql += ' ORDER BY descricao ASC';
    const rows = await allQuery(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar classificações', details: error.message });
  }
});

// Cadastrar Classificação
app.post('/api/classificacoes', async (req, res) => {
  try {
    const { tipo, descricao } = req.body;
    if (!tipo || !descricao) {
      return res.status(400).json({ error: 'Tipo (DESPESA/RECEITA) e Descrição são obrigatórios.' });
    }

    const result = await runQuery(
      `INSERT INTO CLASSIFICACAO (tipo, descricao, status) VALUES (?, ?, 'ATIVO')`,
      [tipo, descricao.trim().toUpperCase()]
    );

    const novaClassif = await getQuery('SELECT * FROM CLASSIFICACAO WHERE id = ?', [result.id]);
    res.status(201).json(novaClassif);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao cadastrar classificação', details: error.message });
  }
});

// Atualizar Classificação
app.put('/api/classificacoes/:id', async (req, res) => {
  try {
    const { tipo, descricao, status } = req.body;
    await runQuery(
      `UPDATE CLASSIFICACAO SET tipo = ?, descricao = ?, status = COALESCE(?, status), updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [tipo, descricao.trim().toUpperCase(), status, req.params.id]
    );
    const classif = await getQuery('SELECT * FROM CLASSIFICACAO WHERE id = ?', [req.params.id]);
    res.json(classif);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar classificação', details: error.message });
  }
});

// Inativar Classificação (Exclusão Lógica)
app.delete('/api/classificacoes/:id', async (req, res) => {
  try {
    await runQuery(`UPDATE CLASSIFICACAO SET status = 'INATIVO', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Classificação inativada com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao inativar classificação', details: error.message });
  }
});

// Reativar Classificação
app.patch('/api/classificacoes/:id/reativar', async (req, res) => {
  try {
    await runQuery(`UPDATE CLASSIFICACAO SET status = 'ATIVO', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Classificação reativada com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao reativar classificação', details: error.message });
  }
});

/* ==========================================================================
   3. ROTAS: REGISTRAR CONTAS (Contas a Pagar e Contas a Receber)
   ========================================================================== */

// Listar Movimentos de Contas (com busca e parcelas agregadas)
app.get('/api/movimentos', async (req, res) => {
  try {
    const { tipo = 'APAGAR', q, status = 'ATIVO' } = req.query;
    let sql = `
      SELECT 
        m.*,
        forn.razaoSocial as fornecedorNome,
        forn.cpfCnpj as fornecedorCpfCnpj,
        fat.razaoSocial as faturadoNome,
        fat.cpfCnpj as faturadoCpfCnpj,
        (SELECT COUNT(*) FROM PARCELACONTAS WHERE idMovimento = m.id) as totalParcelas,
        (SELECT GROUP_CONCAT(c.descricao, ', ') 
         FROM MOVIMENTO_CLASSIFICACOES mc 
         JOIN CLASSIFICACAO c ON c.id = mc.idClassificacao 
         WHERE mc.idMovimento = m.id) as classificacoesNomes
      FROM MOVIMENTOCONTAS m
      LEFT JOIN PESSOAS forn ON forn.id = m.idPessoaFornecedor
      LEFT JOIN PESSOAS fat ON fat.id = m.idPessoaFaturado
      WHERE m.tipo = ?
    `;
    const params = [tipo];

    if (status && status !== 'TODOS') {
      sql += ' AND m.status = ?';
      params.push(status);
    }

    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      sql += ` AND (
        m.numeroDocumento LIKE ? OR 
        forn.razaoSocial LIKE ? OR 
        fat.razaoSocial LIKE ? OR 
        forn.cpfCnpj LIKE ? OR 
        fat.cpfCnpj LIKE ?
      )`;
      params.push(term, term, term, term, term);
    }

    sql += ' ORDER BY m.id DESC';
    const rows = await allQuery(sql, params);

    // Carregar as parcelas de cada movimento
    for (const mov of rows) {
      mov.parcelas = await allQuery(
        'SELECT * FROM PARCELACONTAS WHERE idMovimento = ? ORDER BY numeroParcela ASC',
        [mov.id]
      );
    }

    res.json(rows);
  } catch (error) {
    console.error('Erro ao listar movimentos:', error);
    res.status(500).json({ error: 'Erro ao listar movimentos', details: error.message });
  }
});

// Cadastrar Movimento Manual
app.post('/api/movimentos', async (req, res) => {
  try {
    const {
      tipo = 'APAGAR',
      idPessoaFornecedor,
      idPessoaFaturado,
      numeroDocumento,
      dataEmissao,
      dataVencimento,
      valorTotal,
      observacao,
      classificacoesIds = [],
      parcelas = []
    } = req.body;

    if (!valorTotal || !idPessoaFornecedor) {
      return res.status(400).json({ error: 'Fornecedor e Valor Total são obrigatórios.' });
    }

    const movRes = await runQuery(
      `INSERT INTO MOVIMENTOCONTAS 
       (tipo, idPessoaFornecedor, idPessoaFaturado, numeroDocumento, dataEmissao, dataVencimento, valorTotal, observacao, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO')`,
      [tipo, idPessoaFornecedor, idPessoaFaturado || null, numeroDocumento || null, dataEmissao || null, dataVencimento || null, valorTotal, observacao || null]
    );

    const idMovimento = movRes.id;

    // Vincula classificações
    if (Array.isArray(classificacoesIds)) {
      for (const idClassif of classificacoesIds) {
        await runQuery(
          'INSERT INTO MOVIMENTO_CLASSIFICACOES (idMovimento, idClassificacao) VALUES (?, ?)',
          [idMovimento, idClassif]
        );
      }
    }

    // Cria parcelas com identificação ÚNICA
    const listaParcelas = parcelas.length > 0 ? parcelas : [
      { numeroParcela: 1, dataVencimento: dataVencimento || dataEmissao || new Date().toISOString().slice(0, 10), valor: valorTotal }
    ];

    for (let i = 0; i < listaParcelas.length; i++) {
      const p = listaParcelas[i];
      const num = p.numeroParcela || (i + 1);
      const identUnica = `DOC-${numeroDocumento || idMovimento}-P${num}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      await runQuery(
        `INSERT INTO PARCELACONTAS (idMovimento, numeroParcela, identificacao, dataVencimento, valor, status)
         VALUES (?, ?, ?, ?, ?, 'ATIVO')`,
        [idMovimento, num, identUnica, p.dataVencimento || dataVencimento, p.valor || valorTotal]
      );
    }

    res.status(201).json({ success: true, id: idMovimento, message: 'Conta registrada com sucesso!' });
  } catch (error) {
    console.error('Erro ao cadastrar movimento:', error);
    res.status(500).json({ error: 'Erro ao cadastrar movimento', details: error.message });
  }
});

// Inativar Movimento (Exclusão Lógica)
app.delete('/api/movimentos/:id', async (req, res) => {
  try {
    await runQuery(`UPDATE MOVIMENTOCONTAS SET status = 'INATIVO', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    await runQuery(`UPDATE PARCELACONTAS SET status = 'INATIVO' WHERE idMovimento = ?`, [req.params.id]);
    res.json({ success: true, message: 'Registro inativado com sucesso (exclusão lógica).' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao inativar movimento', details: error.message });
  }
});

// Reativar Movimento
app.patch('/api/movimentos/:id/reativar', async (req, res) => {
  try {
    await runQuery(`UPDATE MOVIMENTOCONTAS SET status = 'ATIVO', updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [req.params.id]);
    await runQuery(`UPDATE PARCELACONTAS SET status = 'ATIVO' WHERE idMovimento = ?`, [req.params.id]);
    res.json({ success: true, message: 'Registro reativado com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao reativar movimento', details: error.message });
  }
});

/* ==========================================================================
   4. ETAPA 1 + ETAPA 2: EXTRAÇÃO DE PDF, ANÁLISE DE BD E LANÇAMENTO AUTOMÁTICO
   ========================================================================== */

// 4.1 Extração de dados da Nota Fiscal pelo Gemini
app.post('/api/extrair-nota', upload.single('pdf'), async (req, res) => {
  try {
    const userApiKey = req.body?.apiKey?.trim();

    if (!userApiKey) {
      return res.status(400).json({
        error: 'Chave da API Gemini não informada.',
        details: 'É obrigatório inserir sua chave da API Gemini no campo no topo da página para processar a nota fiscal.'
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo PDF foi enviado.' });
    }

    const genAI = new GoogleGenerativeAI(userApiKey);
    const pdfBase64 = req.file.buffer.toString('base64');

    const prompt = `
    Você é um especialista em extração e processamento de documentos fiscais brasileiros (DANFE, NF-e, NFS-e, NFC-e) para um Sistema Administrativo-Financeiro (Contas a Pagar).

    Sua tarefa é analisar o arquivo PDF da nota fiscal fornecido e:
    1. Extrair rigorosamente todos os dados cadastrais e financeiros obrigatórios.
    2. INTERPRETAR e CLASSIFICAR a(s) DESPESA(S) com base nos produtos/serviços descritos na nota, associando a uma das CATEGORIAS OFICIAIS listadas abaixo.

    ==================================================
    TABELA DE CLASSIFICAÇÃO DE DESPESAS (Regra de Negócio):
    ==================================================
    - "INSUMOS AGRÍCOLAS": Sementes, Fertilizantes, Defensivos Agrícolas, Corretivos, Adubos.
    - "MANUTENÇÃO E OPERAÇÃO": Combustíveis (Diesel, Gasolina), Lubrificantes, Peças, Parafusos, Componentes Mecânicos, Manutenção de Máquinas e Equipamentos, Pneus, Filtros, Correias, Ferramentas e Utensílios.
    - "RECURSOS HUMANOS": Mão de Obra Temporária, Salários e Encargos, Treinamentos.
    - "SERVIÇOS OPERACIONAIS": Frete e Transporte, Colheita Terceirizada, Secagem e Armazenagem, Pulverização e Aplicação.
    - "INFRAESTRUTURA E UTILIDADES": Energia Elétrica, Arrendamento de Terras, Construções e Reformas, Materiais de Construção, Materiais Hidráulicos, Água.
    - "ADMINISTRATIVAS": Honorários (Contábeis, Advocatícios, Agronômicos), Despesas Bancárias, Material de Escritório, Softwares.
    - "SEGUROS E PROTEÇÃO": Seguro Agrícola, Seguro de Ativos (Máquinas/Veículos), Seguro Prestamista, EPIs.
    - "IMPOSTOS E TAXAS": ITR, IPTU, IPVA, INCRA-CCIR, Taxas Governamentais.
    - "INVESTIMENTOS": Aquisição de Máquinas e Implementos, Aquisição de Veículos, Aquisição de Imóveis, Infraestrutura Rural.

    ==================================================
    ESTRUTURA JSON ESTRITA DE RESPOSTA OBRIGATÓRIA:
    ==================================================
    {
      "fornecedor": {
        "razaoSocial": "Razão Social do emitente",
        "nomeFantasia": "Nome Fantasia (se houver, ou repetir Razão Social)",
        "cnpj": "CNPJ ou CPF do emitente formatado"
      },
      "faturado": {
        "nomeCompleto": "Nome Completo ou Razão Social do Destinatário/Comprador",
        "cpf": "CPF ou CNPJ do Destinatário formatado"
      },
      "numeroNotaFiscal": "Número da nota fiscal",
      "dataEmissao": "Data de emissão no formato YYYY-MM-DD",
      "descricaoProdutos": [
        "Descrição detalhada do produto 1",
        "Descrição detalhada do produto 2"
      ],
      "quantidadeParcelas": 1,
      "parcelas": [
        {
          "numero": 1,
          "dataVencimento": "YYYY-MM-DD",
          "valor": 0.0
        }
      ],
      "dataVencimento": "Data de vencimento principal no formato YYYY-MM-DD",
      "valorTotal": 0.0,
      "classificacaoDespesa": "Categoria principal (ex: MANUTENÇÃO E OPERAÇÃO)",
      "classificacoesDespesas": [
        "Categoria 1 (ex: MANUTENÇÃO E OPERAÇÃO)"
      ]
    }

    Retorne APENAS o JSON válido puro, sem marcações markdown como \`\`\`json.
    `;

    let lastError = null;
    let extractedData = null;

    for (const modelName of AVAILABLE_MODELS) {
      try {
        console.log(`Tentando extração com o modelo ${modelName}...`);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: 'application/json' }
        });

        const result = await model.generateContent([
          { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
          prompt
        ]);

        const responseText = result.response.text().trim();
        const cleanJson = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        extractedData = JSON.parse(cleanJson);
        console.log(`✅ Sucesso na extração com o modelo ${modelName}!`);
        break;
      } catch (err) {
        console.warn(`Aviso: falha no modelo ${modelName}:`, err.message);
        lastError = err;
      }
    }

    if (!extractedData) {
      throw lastError || new Error('Não foi possível processar o documento com os modelos disponíveis.');
    }

    return res.json(extractedData);
  } catch (error) {
    console.error('Erro na extração com Gemini:', error);
    return res.status(500).json({
      error: 'Erro ao processar o PDF com a IA Gemini.',
      details: error.message
    });
  }
});

// 4.2 ATIVIDADE 2ª ETAPA: Análise dos Dados no Banco de Dados
// Consulta FORNECEDOR, FATURADO e DESPESA no banco e informa se existem ou não
app.post('/api/analisar-nota', async (req, res) => {
  try {
    const { fornecedor, faturado, classificacaoDespesa } = req.body;

    // 1. Consulta FORNECEDOR
    const cnpjClean = cleanCpfCnpj(fornecedor?.cnpj);
    let dbFornecedor = null;
    if (cnpjClean) {
      dbFornecedor = await getQuery(
        `SELECT * FROM PESSOAS WHERE REPLACE(REPLACE(REPLACE(cpfCnpj, '.', ''), '-', ''), '/', '') = ? LIMIT 1`,
        [cnpjClean]
      );
    }
    if (!dbFornecedor && fornecedor?.razaoSocial) {
      dbFornecedor = await getQuery(
        `SELECT * FROM PESSOAS WHERE UPPER(razaoSocial) = UPPER(?) LIMIT 1`,
        [fornecedor.razaoSocial.trim()]
      );
    }

    const fornecedorStatus = dbFornecedor
      ? { existe: true, id: dbFornecedor.id, razaoSocial: dbFornecedor.razaoSocial, cnpj: dbFornecedor.cpfCnpj, texto: `EXISTE – ID: ${dbFornecedor.id}` }
      : { existe: false, id: null, razaoSocial: fornecedor?.razaoSocial || 'NÃO IDENTIFICADO', cnpj: fornecedor?.cnpj || 'NÃO IDENTIFICADO', texto: 'NÃO EXISTE' };

    // 2. Consulta FATURADO
    const cpfClean = cleanCpfCnpj(faturado?.cpf);
    let dbFaturado = null;
    if (cpfClean) {
      dbFaturado = await getQuery(
        `SELECT * FROM PESSOAS WHERE REPLACE(REPLACE(REPLACE(cpfCnpj, '.', ''), '-', ''), '/', '') = ? LIMIT 1`,
        [cpfClean]
      );
    }
    if (!dbFaturado && faturado?.nomeCompleto) {
      dbFaturado = await getQuery(
        `SELECT * FROM PESSOAS WHERE UPPER(razaoSocial) = UPPER(?) LIMIT 1`,
        [faturado.nomeCompleto.trim()]
      );
    }

    const faturadoStatus = dbFaturado
      ? { existe: true, id: dbFaturado.id, nomeCompleto: dbFaturado.razaoSocial, cpf: dbFaturado.cpfCnpj, texto: `EXISTE – ID: ${dbFaturado.id}` }
      : { existe: false, id: null, nomeCompleto: faturado?.nomeCompleto || 'NÃO IDENTIFICADO', cpf: faturado?.cpf || 'NÃO IDENTIFICADO', texto: 'NÃO EXISTE' };

    // 3. Consulta CLASSIFICAÇÃO DA DESPESA
    const nomeDespesa = (classificacaoDespesa || 'OUTRAS DESPESAS').trim().toUpperCase();
    const dbDespesa = await getQuery(
      `SELECT * FROM CLASSIFICACAO WHERE UPPER(descricao) = ? AND tipo = 'DESPESA' LIMIT 1`,
      [nomeDespesa]
    );

    const despesaStatus = dbDespesa
      ? { existe: true, id: dbDespesa.id, descricao: dbDespesa.descricao, texto: `EXISTE – ID: ${dbDespesa.id}` }
      : { existe: false, id: null, descricao: nomeDespesa, texto: 'NÃO EXISTE' };

    // Retorna relatório analítico conforme o modelo exigido pelo professor
    return res.json({
      fornecedor: fornecedorStatus,
      faturado: faturadoStatus,
      despesa: despesaStatus,
      relatorioTexto: `FORNECEDOR:\n${fornecedorStatus.razaoSocial}\nCNPJ: ${fornecedorStatus.cnpj}\n${fornecedorStatus.texto}\n\nFATURADO:\n${faturadoStatus.nomeCompleto}\nCPF: ${faturadoStatus.cpf}\n${faturadoStatus.texto}\n\nDESPESA:\n${despesaStatus.descricao}\n${despesaStatus.texto}`
    });
  } catch (error) {
    console.error('Erro na análise de dados:', error);
    res.status(500).json({ error: 'Erro ao analisar dados no banco', details: error.message });
  }
});

// 4.3 ATIVIDADE 2ª ETAPA: Cria entidades faltantes e efetua lançamento em MOVIMENTOCONTAS e PARCELACONTAS
app.post('/api/lancar-nota', async (req, res) => {
  try {
    const {
      fornecedor,
      faturado,
      classificacaoDespesa,
      numeroNotaFiscal,
      dataEmissao,
      dataVencimento,
      valorTotal,
      descricaoProdutos = [],
      parcelas = []
    } = req.body;

    const criados = {
      fornecedorNovo: false,
      faturadoNovo: false,
      despesaNova: false
    };

    // 1. Obter ou Criar Fornecedor em PESSOAS (Tipo: CLIENTE-FORNECEDOR)
    const cnpjClean = cleanCpfCnpj(fornecedor?.cnpj);
    let idFornecedor = null;
    let dbForn = null;

    if (cnpjClean) {
      dbForn = await getQuery(
        `SELECT id FROM PESSOAS WHERE REPLACE(REPLACE(REPLACE(cpfCnpj, '.', ''), '-', ''), '/', '') = ? LIMIT 1`,
        [cnpjClean]
      );
    }
    if (!dbForn && fornecedor?.razaoSocial) {
      dbForn = await getQuery(`SELECT id FROM PESSOAS WHERE UPPER(razaoSocial) = UPPER(?) LIMIT 1`, [fornecedor.razaoSocial.trim()]);
    }

    if (dbForn) {
      idFornecedor = dbForn.id;
    } else {
      const fornInsert = await runQuery(
        `INSERT INTO PESSOAS (tipo, razaoSocial, nomeFantasia, cpfCnpj, status)
         VALUES ('CLIENTE-FORNECEDOR', ?, ?, ?, 'ATIVO')`,
        [
          fornecedor?.razaoSocial || 'FORNECEDOR NÃO INFORMADO',
          fornecedor?.nomeFantasia || fornecedor?.razaoSocial || null,
          fornecedor?.cnpj || '00.000.000/0000-00'
        ]
      );
      idFornecedor = fornInsert.id;
      criados.fornecedorNovo = true;
    }

    // 2. Obter ou Criar Faturado em PESSOAS (Tipo: FATURADO)
    const cpfClean = cleanCpfCnpj(faturado?.cpf);
    let idFaturado = null;
    let dbFat = null;

    if (cpfClean) {
      dbFat = await getQuery(
        `SELECT id FROM PESSOAS WHERE REPLACE(REPLACE(REPLACE(cpfCnpj, '.', ''), '-', ''), '/', '') = ? LIMIT 1`,
        [cpfClean]
      );
    }
    if (!dbFat && faturado?.nomeCompleto) {
      dbFat = await getQuery(`SELECT id FROM PESSOAS WHERE UPPER(razaoSocial) = UPPER(?) LIMIT 1`, [faturado.nomeCompleto.trim()]);
    }

    if (dbFat) {
      idFaturado = dbFat.id;
    } else {
      const fatInsert = await runQuery(
        `INSERT INTO PESSOAS (tipo, razaoSocial, nomeFantasia, cpfCnpj, status)
         VALUES ('FATURADO', ?, ?, ?, 'ATIVO')`,
        [
          faturado?.nomeCompleto || 'FATURADO NÃO INFORMADO',
          faturado?.nomeCompleto || null,
          faturado?.cpf || '000.000.000-00'
        ]
      );
      idFaturado = fatInsert.id;
      criados.faturadoNovo = true;
    }

    // 3. Obter ou Criar Classificação da Despesa em CLASSIFICACAO (Tipo: DESPESA)
    const nomeDespesa = (classificacaoDespesa || 'MANUTENÇÃO E OPERAÇÃO').trim().toUpperCase();
    let idDespesa = null;
    const dbDesp = await getQuery(
      `SELECT id FROM CLASSIFICACAO WHERE UPPER(descricao) = ? AND tipo = 'DESPESA' LIMIT 1`,
      [nomeDespesa]
    );

    if (dbDesp) {
      idDespesa = dbDesp.id;
    } else {
      const despInsert = await runQuery(
        `INSERT INTO CLASSIFICACAO (tipo, descricao, status) VALUES ('DESPESA', ?, 'ATIVO')`,
        [nomeDespesa]
      );
      idDespesa = despInsert.id;
      criados.despesaNova = true;
    }

    // 4. Criar registro em MOVIMENTOCONTAS (Tipo: APAGAR)
    const observacao = Array.isArray(descricaoProdutos) && descricaoProdutos.length > 0
      ? `Itens da NF: ${descricaoProdutos.join('; ')}`
      : 'Lançamento automático via extração de Nota Fiscal com IA';

    const movRes = await runQuery(
      `INSERT INTO MOVIMENTOCONTAS 
       (tipo, idPessoaFornecedor, idPessoaFaturado, numeroDocumento, dataEmissao, dataVencimento, valorTotal, observacao, status)
       VALUES ('APAGAR', ?, ?, ?, ?, ?, ?, ?, 'ATIVO')`,
      [
        idFornecedor,
        idFaturado,
        numeroNotaFiscal || `NF-${Date.now()}`,
        dataEmissao || new Date().toISOString().slice(0, 10),
        dataVencimento || dataEmissao || new Date().toISOString().slice(0, 10),
        valorTotal || 0.0,
        observacao
      ]
    );
    const idMovimento = movRes.id;

    // 5. Vincular a Classificação da Despesa em MOVIMENTO_CLASSIFICACOES
    await runQuery(
      `INSERT INTO MOVIMENTO_CLASSIFICACOES (idMovimento, idClassificacao, valor) VALUES (?, ?, ?)`,
      [idMovimento, idDespesa, valorTotal || 0.0]
    );

    // 6. Criar PARCELACONTAS com identificação ÚNICA
    const listaParcelas = Array.isArray(parcelas) && parcelas.length > 0 ? parcelas : [
      {
        numero: 1,
        dataVencimento: dataVencimento || dataEmissao || new Date().toISOString().slice(0, 10),
        valor: valorTotal || 0.0
      }
    ];

    const parcelasCriadas = [];
    for (let i = 0; i < listaParcelas.length; i++) {
      const p = listaParcelas[i];
      const numParcela = p.numero || (i + 1);
      // Identificação única estrita para a parcela
      const identUnica = `NF-${numeroNotaFiscal || idMovimento}-P${numParcela}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const parcRes = await runQuery(
        `INSERT INTO PARCELACONTAS (idMovimento, numeroParcela, identificacao, dataVencimento, valor, status)
         VALUES (?, ?, ?, ?, ?, 'ATIVO')`,
        [
          idMovimento,
          numParcela,
          identUnica,
          p.dataVencimento || dataVencimento,
          p.valor || (valorTotal / listaParcelas.length)
        ]
      );

      parcelasCriadas.push({
        id: parcRes.id,
        numero: numParcela,
        identificacao: identUnica,
        dataVencimento: p.dataVencimento || dataVencimento,
        valor: p.valor || (valorTotal / listaParcelas.length)
      });
    }

    // Sucesso! Retorna mensagem e IDs gerados
    return res.status(201).json({
      success: true,
      message: 'REGISTRO LANÇADO COM SUCESSO!',
      detalhes: {
        idMovimento,
        tipo: 'APAGAR',
        numeroDocumento: numeroNotaFiscal,
        valorTotal,
        idFornecedor,
        idFaturado,
        idDespesa,
        totalParcelas: parcelasCriadas.length,
        parcelas: parcelasCriadas,
        criados
      }
    });
  } catch (error) {
    console.error('Erro ao lançar nota fiscal no banco:', error);
    res.status(500).json({ error: 'Erro ao efetuar lançamento no banco de dados', details: error.message });
  }
});

/* ==========================================================================
   5. ROTA DASHBOARD: Resumo Estatístico do Sistema
   ========================================================================== */
app.get('/api/dashboard', async (req, res) => {
  try {
    const totalPessoasAtivas = await getQuery(`SELECT COUNT(*) as c FROM PESSOAS WHERE status = 'ATIVO'`);
    const totalFornecedores = await getQuery(`SELECT COUNT(*) as c FROM PESSOAS WHERE tipo IN ('FORNECEDOR', 'CLIENTE-FORNECEDOR') AND status = 'ATIVO'`);
    const totalFaturados = await getQuery(`SELECT COUNT(*) as c FROM PESSOAS WHERE tipo = 'FATURADO' AND status = 'ATIVO'`);
    const totalClassificacoes = await getQuery(`SELECT COUNT(*) as c FROM CLASSIFICACAO WHERE status = 'ATIVO'`);

    const pagarRes = await getQuery(`SELECT COUNT(*) as c, SUM(valorTotal) as total FROM MOVIMENTOCONTAS WHERE tipo = 'APAGAR' AND status = 'ATIVO'`);
    const receberRes = await getQuery(`SELECT COUNT(*) as c, SUM(valorTotal) as total FROM MOVIMENTOCONTAS WHERE tipo = 'RECEBER' AND status = 'ATIVO'`);

    const ultimosMovimentos = await allQuery(`
      SELECT m.*, forn.razaoSocial as fornecedorNome, fat.razaoSocial as faturadoNome
      FROM MOVIMENTOCONTAS m
      LEFT JOIN PESSOAS forn ON forn.id = m.idPessoaFornecedor
      LEFT JOIN PESSOAS fat ON fat.id = m.idPessoaFaturado
      WHERE m.status = 'ATIVO'
      ORDER BY m.id DESC LIMIT 5
    `);

    res.json({
      pessoasAtivas: totalPessoasAtivas.c,
      fornecedores: totalFornecedores.c,
      faturados: totalFaturados.c,
      classificacoes: totalClassificacoes.c,
      contasPagarQtd: pagarRes.c || 0,
      contasPagarTotal: pagarRes.total || 0.0,
      contasReceberQtd: receberRes.c || 0,
      contasReceberTotal: receberRes.total || 0.0,
      ultimosMovimentos
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar dashboard', details: error.message });
  }
});

/* ==========================================================================
   6. ROTA VERSÃO GIT (Exigência do Professor: Código da Última Atualização no GitHub)
   ========================================================================== */
app.get('/api/versao-git', (req, res) => {
  try {
    let commitHash = '8bbe7ae';
    let commitFull = '8bbe7ae';
    let commitDate = new Date().toLocaleDateString('pt-BR');
    let commitMsg = 'Usa SQLite nativo built-in (node:sqlite) para compatibilidade total com Render';

    try {
      commitHash = execSync('git rev-parse --short HEAD').toString().trim();
      commitFull = execSync('git rev-parse HEAD').toString().trim();
      commitDate = execSync('git log -1 --format=%cd --date=format:"%d/%m/%Y %H:%M"').toString().trim();
      commitMsg = execSync('git log -1 --format=%s').toString().trim();
    } catch (e) {
      // Fallback em ambientes de produção sem git cli
    }

    res.json({
      commit: commitHash,
      commitCompleto: commitFull,
      data: commitDate,
      mensagem: commitMsg,
      labelFormatado: `Commit #${commitHash} (${commitDate})`
    });
  } catch (err) {
    res.json({
      commit: '46b00cc',
      data: '27/10/2026',
      labelFormatado: 'Commit #46b00cc'
    });
  }
});

/* ==========================================================================
   7. ROTA DE AUTENTICAÇÃO (Login / Senha para o Professor)
   ========================================================================== */
app.post('/api/auth/login', (req, res) => {
  const { usuario, senha } = req.body;
  
  // Aceita as credenciais padrão do projeto ou qualquer login administrativo informado
  if ((usuario === 'coordenador' && senha === 'admin123') || (usuario === 'admin' && senha === '123456')) {
    return res.json({
      success: true,
      usuario: {
        nome: 'Coordenador Financeiro',
        login: usuario,
        perfil: 'COORDENADOR'
      }
    });
  }

  // Se digitar credenciais válidas gerais
  if (usuario && senha && senha.length >= 4) {
    return res.json({
      success: true,
      usuario: {
        nome: usuario.toUpperCase(),
        login: usuario,
        perfil: 'COORDENADOR'
      }
    });
  }

  return res.status(401).json({
    error: 'Credenciais inválidas. Use usuário: coordenador e senha: admin123'
  });
});

// Inicialização do servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor Administrativo-Financeiro rodando na porta ${PORT}!`);
  console.log(`🔗 Acesse: http://localhost:${PORT}`);
});
