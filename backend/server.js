// server.js
// Backend para Sistema de Ingressos com Chaves PIX

const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ═══════════════════════════════════════════════════════════════════
// CORS CORRIGIDO - Aceita origens específicas
// ═══════════════════════════════════════════════════════════════════
const allowedOrigins = [
  'https://guiche-master-frontend.vercel.app',
];

app.use(cors({
  origin: function(origin, callback) {
    // Permite requisições sem origin (como Postman, curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('❌ Origem bloqueada:', origin);
      callback(null, true); // Temporariamente aceita todas durante debug
    }
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Headers CORS adicionais
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*'); // Fallback
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

app.use(express.json());

// ═══════════════════════════════════════════════════════════════════
// BANCO DE DADOS DE CHAVES PIX
// ═══════════════════════════════════════════════════════════════════

let pixKeys = [
  {
    id: '1',
    key: 'a9d156cf-2e35-4728-b5de-5bd3191f0485',
    type: 'cpf',
    name: 'Empresa LTDA',
    active: true,
    createdAt: new Date().toISOString()
  },
];

let orders = [];

// ═══════════════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════════════

function getRandomPixKey() {
  const activeKeys = pixKeys.filter(k => k.active);
  if (activeKeys.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * activeKeys.length);
  return activeKeys[randomIndex];
}

function generateOrderCode() {
  const prefix = 'GM';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// ═══════════════════════════════════════════════════════════════════
// ENDPOINTS - SAÚDE
// ═══════════════════════════════════════════════════════════════════

app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Backend Guichê Master - API funcionando!',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: 'GET /health',
      payment: 'POST /api/payment',
      order: 'GET /api/order/:orderId',
      pixKeys: 'GET /api/admin/pix-keys'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Backend rodando!',
    pixKeysCount: pixKeys.filter(k => k.active).length,
    ordersCount: orders.length,
    timestamp: new Date().toISOString()
  });
});

// ═══════════════════════════════════════════════════════════════════
// ENDPOINTS - PAGAMENTO PIX
// ═══════════════════════════════════════════════════════════════════

app.post('/api/payment', async (req, res) => {
  try {
    const { customer, items, total } = req.body;

    console.log('🔥 Nova solicitação:', {
      customer: customer?.email,
      total,
      itemsCount: items?.length,
      origin: req.headers.origin
    });

    if (!customer || !customer.name || !customer.email || !customer.cpf) {
      return res.status(400).json({
        success: false,
        error: 'Dados do cliente incompletos'
      });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Nenhum item no carrinho'
      });
    }

    const pixKey = getRandomPixKey();
    
    if (!pixKey) {
      return res.status(500).json({
        success: false,
        error: 'Nenhuma chave PIX disponível'
      });
    }

    const order = {
      id: uuidv4(),
      code: generateOrderCode(),
      customer: {
        name: customer.name,
        email: customer.email,
        cpf: customer.cpf.replace(/\D/g, ''),
        phone: customer.phone?.replace(/\D/g, '') || ''
      },
      items: items.map(item => ({
        title: item.title,
        unitPrice: item.unitPrice || item.unit_price,
        quantity: item.quantity
      })),
      total: total,
      pixKey: {
        id: pixKey.id,
        key: pixKey.key,
        type: pixKey.type,
        name: pixKey.name
      },
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    };

    orders.push(order);

    console.log('✅ Pedido criado:', order.code);

    res.json({
      success: true,
      order: {
        id: order.id,
        code: order.code,
        status: order.status,
        expiresAt: order.expiresAt
      },
      pix: {
        key: pixKey.key,
        type: pixKey.type,
        name: pixKey.name,
        qrcode: pixKey.key
      },
      total: order.total,
      message: 'Copie a chave PIX e faça o pagamento'
    });

  } catch (error) {
    console.error('💥 Erro:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

app.post('/api/payment/:orderId/confirm', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = orders.find(o => o.id === orderId || o.code === orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Pedido não encontrado'
      });
    }

    order.status = 'paid';
    order.paidAt = new Date().toISOString();

    console.log('✅ Pagamento confirmado:', order.code);

    res.json({
      success: true,
      order: {
        id: order.id,
        code: order.code,
        status: order.status,
        paidAt: order.paidAt
      },
      message: 'Pagamento confirmado!'
    });

  } catch (error) {
    console.error('Erro ao confirmar:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/order/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = orders.find(o => o.id === orderId || o.code === orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Pedido não encontrado'
      });
    }

    res.json({
      success: true,
      order: {
        id: order.id,
        code: order.code,
        status: order.status,
        total: order.total,
        customer: {
          name: order.customer.name,
          email: order.customer.email
        },
        items: order.items,
        createdAt: order.createdAt,
        expiresAt: order.expiresAt,
        paidAt: order.paidAt
      }
    });

  } catch (error) {
    console.error('Erro ao consultar:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════════════════

app.get('/api/admin/pix-keys', (req, res) => {
  res.json({
    success: true,
    keys: pixKeys,
    total: pixKeys.length,
    active: pixKeys.filter(k => k.active).length
  });
});

app.post('/api/admin/pix-keys', (req, res) => {
  try {
    const { key, type, name } = req.body;

    if (!key || !type || !name) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios: key, type, name'
      });
    }

    if (pixKeys.length >= 5) {
      return res.status(400).json({
        success: false,
        error: 'Limite de 5 chaves atingido'
      });
    }

    if (pixKeys.some(k => k.key === key)) {
      return res.status(400).json({
        success: false,
        error: 'Chave já cadastrada'
      });
    }

    const newKey = {
      id: uuidv4(),
      key,
      type,
      name,
      active: true,
      createdAt: new Date().toISOString()
    };

    pixKeys.push(newKey);

    res.json({
      success: true,
      key: newKey,
      message: 'Chave PIX adicionada'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.put('/api/admin/pix-keys/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { key, type, name, active } = req.body;

    const keyIndex = pixKeys.findIndex(k => k.id === id);
    
    if (keyIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Chave não encontrada'
      });
    }

    if (key !== undefined) pixKeys[keyIndex].key = key;
    if (type !== undefined) pixKeys[keyIndex].type = type;
    if (name !== undefined) pixKeys[keyIndex].name = name;
    if (active !== undefined) pixKeys[keyIndex].active = active;
    pixKeys[keyIndex].updatedAt = new Date().toISOString();

    res.json({
      success: true,
      key: pixKeys[keyIndex],
      message: 'Chave atualizada'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.delete('/api/admin/pix-keys/:id', (req, res) => {
  try {
    const { id } = req.params;
    const keyIndex = pixKeys.findIndex(k => k.id === id);
    
    if (keyIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Chave não encontrada'
      });
    }

    pixKeys.splice(keyIndex, 1);

    res.json({
      success: true,
      message: 'Chave removida'
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/admin/orders', (req, res) => {
  res.json({
    success: true,
    orders: orders.map(o => ({
      id: o.id,
      code: o.code,
      customer: o.customer.name,
      email: o.customer.email,
      total: o.total,
      status: o.status,
      createdAt: o.createdAt
    })),
    total: orders.length
  });
});

// ═══════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════

app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor'
  });
});

// ═══════════════════════════════════════════════════════════════════
// INICIAR SERVIDOR
// ═══════════════════════════════════════════════════════════════════

if (process.env.NODE_ENV !== 'production') {
  const server = app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   🎫  GUICHÊ MASTER - BACKEND                                ║
║   Status: ✅ Rodando                                         ║
║   Porta: ${PORT}                                                ║
║   Chaves PIX: ${pixKeys.filter(k => k.active).length} ativas                                     ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  });

  server.on('error', (error) => {
    console.error('❌ Erro ao iniciar:', error);
    process.exit(1);
  });

  process.on('SIGTERM', () => {
    console.log('👋 Encerrando...');
    server.close(() => process.exit(0));
  });

  process.on('SIGINT', () => {
    console.log('\n👋 Encerrando...');
    server.close(() => process.exit(0));
  });
}

module.exports = app;