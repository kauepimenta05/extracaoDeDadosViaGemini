import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'financeiro.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar ao banco de dados SQLite:', err.message);
  } else {
    console.log('✅ Banco de dados SQLite conectado em:', dbPath);
  }
});

// Helper para executar queries com Promises
export function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

export function getQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function allQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// Inicialização das tabelas e seeds
export async function initDatabase() {
  // Habilita chaves estrangeiras
  await runQuery('PRAGMA foreign_keys = ON;');

  // 1. Tabela PESSOAS (Fornecedores, Clientes, Faturados)
  await runQuery(`
    CREATE TABLE IF NOT EXISTS PESSOAS (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL, -- 'CLIENTE-FORNECEDOR', 'FORNECEDOR', 'CLIENTE', 'FATURADO'
      razaoSocial TEXT NOT NULL,
      nomeFantasia TEXT,
      cpfCnpj TEXT NOT NULL,
      telefone TEXT,
      email TEXT,
      endereco TEXT,
      status TEXT NOT NULL DEFAULT 'ATIVO', -- 'ATIVO', 'INATIVO'
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await runQuery(`CREATE INDEX IF NOT EXISTS idx_pessoas_cpfCnpj ON PESSOAS (cpfCnpj);`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_pessoas_status ON PESSOAS (status);`);

  // 2. Tabela CLASSIFICACAO (Tipos de Despesa e Receita)
  await runQuery(`
    CREATE TABLE IF NOT EXISTS CLASSIFICACAO (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL, -- 'DESPESA', 'RECEITA'
      descricao TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ATIVO', -- 'ATIVO', 'INATIVO'
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await runQuery(`CREATE INDEX IF NOT EXISTS idx_classificacao_tipo ON CLASSIFICACAO (tipo);`);
  await runQuery(`CREATE INDEX IF NOT EXISTS idx_classificacao_status ON CLASSIFICACAO (status);`);

  // 3. Tabela MOVIMENTOCONTAS (Contas a Pagar e Contas a Receber)
  await runQuery(`
    CREATE TABLE IF NOT EXISTS MOVIMENTOCONTAS (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL, -- 'APAGAR', 'RECEBER'
      idPessoaFornecedor INTEGER, -- Foreign key para PESSOAS (quem emite/fornecedor)
      idPessoaFaturado INTEGER,   -- Foreign key para PESSOAS (a quem se destina/faturado)
      numeroDocumento TEXT,
      dataEmissao TEXT,
      dataVencimento TEXT,
      valorTotal REAL NOT NULL DEFAULT 0.0,
      observacao TEXT,
      status TEXT NOT NULL DEFAULT 'ATIVO', -- 'ATIVO', 'INATIVO'
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (idPessoaFornecedor) REFERENCES PESSOAS (id),
      FOREIGN KEY (idPessoaFaturado) REFERENCES PESSOAS (id)
    );
  `);

  // 4. Tabela MOVIMENTO_CLASSIFICACOES (N:N - Um movimento pode ter uma ou mais classificações)
  await runQuery(`
    CREATE TABLE IF NOT EXISTS MOVIMENTO_CLASSIFICACOES (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idMovimento INTEGER NOT NULL,
      idClassificacao INTEGER NOT NULL,
      valor REAL DEFAULT 0.0,
      FOREIGN KEY (idMovimento) REFERENCES MOVIMENTOCONTAS (id) ON DELETE CASCADE,
      FOREIGN KEY (idClassificacao) REFERENCES CLASSIFICACAO (id)
    );
  `);

  // 5. Tabela PARCELACONTAS (Uma ou mais parcelas com identificação ÚNICA)
  await runQuery(`
    CREATE TABLE IF NOT EXISTS PARCELACONTAS (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idMovimento INTEGER NOT NULL,
      numeroParcela INTEGER NOT NULL DEFAULT 1,
      identificacao TEXT NOT NULL UNIQUE, -- Identificação ÚNICA exigida pela regra de negócio
      dataVencimento TEXT NOT NULL,
      valor REAL NOT NULL DEFAULT 0.0,
      status TEXT NOT NULL DEFAULT 'ATIVO', -- 'ATIVO', 'INATIVO'
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (idMovimento) REFERENCES MOVIMENTOCONTAS (id) ON DELETE CASCADE
    );
  `);

  // Seeds iniciais de Classificação (Categorias Oficiais da N2)
  const countClassif = await getQuery('SELECT COUNT(*) as total FROM CLASSIFICACAO');
  if (countClassif.total === 0) {
    const despesasOficiais = [
      'INSUMOS AGRÍCOLAS',
      'MANUTENÇÃO E OPERAÇÃO',
      'RECURSOS HUMANOS',
      'SERVIÇOS OPERACIONAIS',
      'INFRAESTRUTURA E UTILIDADES',
      'ADMINISTRATIVAS',
      'SEGUROS E PROTEÇÃO',
      'IMPOSTOS E TAXAS',
      'INVESTIMENTOS'
    ];

    for (const d of despesasOficiais) {
      await runQuery('INSERT INTO CLASSIFICACAO (tipo, descricao, status) VALUES (?, ?, ?)', [
        'DESPESA',
        d,
        'ATIVO'
      ]);
    }

    const receitasOficiais = [
      'VENDA DE GRÃOS (SOJA / MILHO)',
      'PRESTAÇÃO DE SERVIÇOS AGRÍCOLAS',
      'ARRENDAMENTO RECEBIDO',
      'OUTRAS RECEITAS OPERACIONAIS'
    ];

    for (const r of receitasOficiais) {
      await runQuery('INSERT INTO CLASSIFICACAO (tipo, descricao, status) VALUES (?, ?, ?)', [
        'RECEITA',
        r,
        'ATIVO'
      ]);
    }
    console.log('🌱 Seeds de Classificações oficiais inseridos com sucesso!');
  }

  // Seed inicial opcional de Pessoas para testar busca de EXISTE / NÃO EXISTE
  const countPessoas = await getQuery('SELECT COUNT(*) as total FROM PESSOAS');
  if (countPessoas.total === 0) {
    await runQuery(`
      INSERT INTO PESSOAS (tipo, razaoSocial, nomeFantasia, cpfCnpj, telefone, email, endereco, status)
      VALUES 
      ('FATURADO', 'BELTRANO DA SILVA', 'BELTRANO', '999.999.999-99', '(64) 99999-1111', 'beltrano@fazenda.com.br', 'Fazenda Modelo, KM 15 - Rio Verde/GO', 'ATIVO'),
      ('CLIENTE-FORNECEDOR', 'AGROPECUARIA BOM JESUS LTDA', 'BOM JESUS', '00.123.456/0001-78', '(64) 3621-0000', 'contato@bomjesus.com.br', 'Av. Presidente Vargas, 100 - Rio Verde/GO', 'ATIVO');
    `);
    console.log('🌱 Seeds de Pessoas de exemplo inseridos com sucesso!');
  }
}

export default db;
