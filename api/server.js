/**
 * API сервер для магазина мерча Ростелеком
 * Работает с JSON-файлами в папке data/
 * 
 * Запуск:
 * npm install
 * npm start
 * 
 * Эндпоинты:
 * GET  /api?action=getProducts     - получить все товары
 * GET  /api?action=getOrders       - получить все заказы
 * POST /api?action=createOrder     - создать заказ
 * POST /api?action=updateOrderStatus - обновить статус заказа
 * POST /api?action=updateProductStock - обновить остаток товара
 * POST /api?action=updateProduct   - обновить данные товара
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// API ключ (замените на свой!)
const API_KEY = 'rt_merch_secret_key_2026';

// Пути к файлам данных
const dataDir = path.join(__dirname, '..', 'data');
const productsFile = path.join(dataDir, 'products.json');
const ordersFile = path.join(dataDir, 'orders.json');

// Создаём папку data если нет
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o755 });
}

// Создаём файлы если нет
if (!fs.existsSync(productsFile)) {
    fs.writeFileSync(productsFile, JSON.stringify([], null, 2));
}
if (!fs.existsSync(ordersFile)) {
    fs.writeFileSync(ordersFile, JSON.stringify([], null, 2));
}

// ====== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ======

function readJSON(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

function writeJSON(filePath, data) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ====== ЭНДПОИНТЫ ======

app.get('/api', (req, res) => {
    const action = req.query.action;
    
    switch (action) {
        case 'getProducts':
            handleGetProducts(res);
            break;
        case 'getOrders':
            handleGetOrders(res);
            break;
        default:
            res.status(400).json({
                success: false,
                error: 'Неизвестное действие. Доступные: getProducts, getOrders'
            });
    }
});

app.post('/api', (req, res) => {
    const action = req.body.action;
    const apiKey = req.body.api_key;
    
    // Проверяем API ключ
    if (apiKey !== API_KEY) {
        return res.status(403).json({
            success: false,
            error: 'Неверный API ключ'
        });
    }
    
    switch (action) {
        case 'createOrder':
            handleCreateOrder(req.body, res);
            break;
        case 'updateOrderStatus':
            handleUpdateOrderStatus(req.body, res);
            break;
        case 'updateProductStock':
            handleUpdateProductStock(req.body, res);
            break;
        case 'updateProduct':
            handleUpdateProduct(req.body, res);
            break;
        default:
            res.status(400).json({
                success: false,
                error: 'Неизвестное действие. Доступные: createOrder, updateOrderStatus, updateProductStock, updateProduct'
            });
    }
});

// ====== ОБРАБОТЧИКИ ======

function handleGetProducts(res) {
    const products = readJSON(productsFile);
    
    res.json({
        success: true,
        products,
        count: products.length
    });
}

function handleGetOrders(res) {
    let orders = readJSON(ordersFile);
    
    // Сортируем: новые сверху
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    res.json({
        success: true,
        orders,
        count: orders.length
    });
}

function handleCreateOrder(body, res) {
    const orders = readJSON(ordersFile);
    const products = readJSON(productsFile);
    
    // Генерируем ID
    const orderId = orders.length > 0 ? Math.max(...orders.map(o => o.id)) + 1 : 1;
    
    // Проверяем наличие товаров
    const items = body.items || [];
    let total = 0;
    const orderItems = [];
    
    for (const item of items) {
        const product = products.find(p => 
            p.id === item.productId || p.name === item.name
        );
        
        if (!product) {
            return res.status(400).json({
                success: false,
                error: `Товар не найден: ${item.name || item.productId}`
            });
        }
        
        const available = product.stock - (product.reserved || 0);
        if (item.quantity > available) {
            return res.status(400).json({
                success: false,
                error: `Недостаточно товара: ${product.name}`
            });
        }
        
        orderItems.push({
            id: product.id,
            name: product.name,
            quantity: item.quantity,
            price: product.price,
            size: item.size || null,
            image: product.image || ''
        });
        
        total += product.price * item.quantity;
        
        // Увеличиваем резерв
        product.reserved = (product.reserved || 0) + item.quantity;
    }
    
    // Создаём заказ
    const order = {
        id: orderId,
        name: body.name || '',
        phone: body.phone || '',
        department: body.department || '',
        email: body.email || '',
        items: JSON.stringify(orderItems),
        total,
        status: 'new',
        created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
        updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
    };
    
    orders.push(order);
    
    // Сохраняем
    writeJSON(ordersFile, orders);
    writeJSON(productsFile, products);
    
    res.json({
        success: true,
        orderId,
        total,
        message: `Заказ #${orderId} создан`
    });
}

function handleUpdateOrderStatus(body, res) {
    const { orderId, status: newStatus } = body;
    
    if (!orderId || !newStatus) {
        return res.status(400).json({
            success: false,
            error: 'Не указаны orderId или status'
        });
    }
    
    const orders = readJSON(ordersFile);
    const products = readJSON(productsFile);
    
    const order = orders.find(o => o.id === orderId);
    
    if (!order) {
        return res.status(404).json({
            success: false,
            error: `Заказ #${orderId} не найден`
        });
    }
    
    const oldStatus = order.status;
    order.status = newStatus;
    order.updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    // Если заказ выполнен или отменён - уменьшаем резерв
    if (['completed', 'cancelled'].includes(newStatus)) {
        const items = JSON.parse(order.items);
        
        for (const item of items) {
            const product = products.find(p => p.id === item.id);
            if (product) {
                product.reserved = Math.max(0, (product.reserved || 0) - item.quantity);
                
                // Если выполнен - уменьшаем stock
                if (newStatus === 'completed') {
                    product.stock = Math.max(0, product.stock - item.quantity);
                }
            }
        }
        
        writeJSON(productsFile, products);
    }
    
    writeJSON(ordersFile, orders);
    
    res.json({
        success: true,
        message: `Статус заказа #${orderId} обновлён на ${newStatus}`
    });
}

function handleUpdateProductStock(body, res) {
    const { productId, stock: newStock } = body;
    
    if (productId === undefined || newStock === undefined) {
        return res.status(400).json({
            success: false,
            error: 'Не указаны productId или stock'
        });
    }
    
    const products = readJSON(productsFile);
    const product = products.find(p => p.id === productId);
    
    if (!product) {
        return res.status(404).json({
            success: false,
            error: `Товар #${productId} не найден`
        });
    }
    
    product.stock = parseInt(newStock);
    
    writeJSON(productsFile, products);
    
    res.json({
        success: true,
        message: 'Остаток товара обновлён'
    });
}

function handleUpdateProduct(body, res) {
    const { id: productId } = body;
    
    if (!productId) {
        return res.status(400).json({
            success: false,
            error: 'Не указан id товара'
        });
    }
    
    const products = readJSON(productsFile);
    const product = products.find(p => p.id === productId);
    
    if (!product) {
        return res.status(404).json({
            success: false,
            error: `Товар #${productId} не найден`
        });
    }
    
    // Обновляем только переданные поля
    const updatableFields = ['name', 'category', 'description', 'price', 'stock', 'image', 'color', 'sizes'];
    for (const field of updatableFields) {
        if (body[field] !== undefined) {
            product[field] = body[field];
        }
    }
    
    writeJSON(productsFile, products);
    
    res.json({
        success: true,
        message: 'Товар обновлён'
    });
}

// Запуск сервера
app.listen(PORT, () => {
    console.log(`🚀 API сервер мерча запущен на порту ${PORT}`);
    console.log(`📦 Товары: http://localhost:${PORT}/api?action=getProducts`);
    console.log(`📋 Заказы: http://localhost:${PORT}/api?action=getOrders`);
    console.log(`🔑 API ключ: ${API_KEY}`);
});
