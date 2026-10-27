import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'financeiro.sqlite');

let db;
try {
  db = new DatabaseSync(dbPath);
  console.log('✅ Banco de dados SQLite nativo (node:sqlite) conectado em:', dbPath);
} catch (err) {
  console.error('❌ Erro ao conectar ao SQLite nativo:', err);
  // Fallback em memória se houver restrição de permissão de escrita
  db = new DatabaseSync(':memory:');
}

// Helpers compatíveis com a API existente
export async function runQuery(sql, params = []) {
  try {
    const trimmed = sql.trim();
    if (trimmed.startsWith('CREATE') || trimmed.startsWith('PRAGMA') || trimmed.startsWith('DROP')) {
      db.exec(sql);
      return { id: 0, changes: 0 };
    }
    const stmt = db.prepare(sql);
    const info = stmt.run(...params);
    return { id: Number(info.lastInsertRowid), changes: info.changes };
  } catch (err) {
    throw err;
  }
}

export async function getQuery(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    const row = stmt.get(...params);
    return row || null;
  } catch (err) {
    throw err;
  }
}

export async function allQuery(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    return rows || [];
  } catch (err) {
    throw err;
  }
}

// Inicialização das tabelas e seeds
export async function initDatabase() {
  await runQuery('PRAGMA foreign_keys = ON;');

  // 1. Tabela PESSOAS (Fornecedores, Clientes, Faturados)
  await runQuery(`
    CREATE TABLE IF NOT EXISTS PESSOAS (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      razaoSocial TEXT NOT NULL,
      nomeFantasia TEXT,
      cpfCnpj TEXT NOT NULL,
      telefone TEXT,
      email TEXT,
      endereco TEXT,
      status TEXT NOT NULL DEFAULT 'ATIVO',
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
      tipo TEXT NOT NULL,
      descricao TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ATIVO',
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
      tipo TEXT NOT NULL,
      idPessoaFornecedor INTEGER,
      idPessoaFaturado INTEGER,
      numeroDocumento TEXT,
      dataEmissao TEXT,
      dataVencimento TEXT,
      valorTotal REAL NOT NULL DEFAULT 0.0,
      observacao TEXT,
      status TEXT NOT NULL DEFAULT 'ATIVO',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (idPessoaFornecedor) REFERENCES PESSOAS (id),
      FOREIGN KEY (idPessoaFaturado) REFERENCES PESSOAS (id)
    );
  `);

  // 4. Tabela MOVIMENTO_CLASSIFICACOES
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

  // 5. Tabela PARCELACONTAS
  await runQuery(`
    CREATE TABLE IF NOT EXISTS PARCELACONTAS (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idMovimento INTEGER NOT NULL,
      numeroParcela INTEGER NOT NULL DEFAULT 1,
      identificacao TEXT NOT NULL UNIQUE,
      dataVencimento TEXT NOT NULL,
      valor REAL NOT NULL DEFAULT 0.0,
      status TEXT NOT NULL DEFAULT 'ATIVO',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (idMovimento) REFERENCES MOVIMENTOCONTAS (id) ON DELETE CASCADE
    );
  `);

  // Seeds iniciais de Classificação
  const countClassif = await getQuery('SELECT COUNT(*) as total FROM CLASSIFICACAO');
  if (!countClassif || countClassif.total === 0) {
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

  // Seed inicial opcional de Pessoas
  const countPessoas = await getQuery('SELECT COUNT(*) as total FROM PESSOAS');
  if (!countPessoas || countPessoas.total === 0) {
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
