<?php
/**
 * API для магазина мерча Ростелеком
 * Работает с JSON-файлами в папке data/
 * 
 * Эндпоинты:
 * GET  ?action=getProducts     - получить все товары
 * GET  ?action=getOrders       - получить все заказы
 * POST ?action=createOrder     - создать заказ
 * POST ?action=updateOrderStatus - обновить статус заказа
 * POST ?action=updateProductStock - обновить остаток товара
 * POST ?action=updateProduct   - обновить данные товара
 */

// Настройки
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Обработка preflight запросов
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// API ключ (замените на свой!)
define('API_KEY', 'rt_merch_secret_key_2026');

// Пути к файлам данных
$dataDir = __DIR__ . '/data';
$productsFile = $dataDir . '/products.json';
$ordersFile = $dataDir . '/orders.json';

// Создаём папку data если нет
if (!file_exists($dataDir)) {
    mkdir($dataDir, 0755, true);
}

// Создаём файлы если нет
if (!file_exists($productsFile)) {
    file_put_contents($productsFile, json_encode([], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}
if (!file_exists($ordersFile)) {
    file_put_contents($ordersFile, json_encode([], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

// Получаем action
$action = $_GET['action'] ?? $_POST['action'] ?? '';

// Проверяем API ключ для POST запросов
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $apiKey = $input['api_key'] ?? $_POST['api_key'] ?? '';
    
    if ($apiKey !== API_KEY) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'Неверный API ключ'
        ]);
        exit();
    }
}

try {
    switch ($action) {
        case 'getProducts':
            handleGetProducts($productsFile);
            break;
            
        case 'getOrders':
            handleGetOrders($ordersFile);
            break;
            
        case 'createOrder':
            handleCreateOrder($ordersFile, $productsFile);
            break;
            
        case 'updateOrderStatus':
            handleUpdateOrderStatus($ordersFile);
            break;
            
        case 'updateProductStock':
            handleUpdateProductStock($productsFile);
            break;
            
        case 'updateProduct':
            handleUpdateProduct($productsFile);
            break;
            
        default:
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Неизвестное действие. Доступные: getProducts, getOrders, createOrder, updateOrderStatus, updateProductStock, updateProduct'
            ]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}

// ====== ФУНКЦИИ-ОБРАБОТЧИКИ ======

function handleGetProducts($productsFile) {
    $products = json_decode(file_get_contents($productsFile), true) ?? [];
    
    echo json_encode([
        'success' => true,
        'products' => $products,
        'count' => count($products)
    ]);
}

function handleGetOrders($ordersFile) {
    $orders = json_decode(file_get_contents($ordersFile), true) ?? [];
    
    // Сортируем: новые сверху
    usort($orders, function($a, $b) {
        return strtotime($b['created_at']) - strtotime($a['created_at']);
    });
    
    echo json_encode([
        'success' => true,
        'orders' => $orders,
        'count' => count($orders)
    ]);
}

function handleCreateOrder($ordersFile, $productsFile) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    $orders = json_decode(file_get_contents($ordersFile), true) ?? [];
    $products = json_decode(file_get_contents($productsFile), true) ?? [];
    
    // Генерируем ID
    $orderId = count($orders) > 0 ? max(array_column($orders, 'id')) + 1 : 1;
    
    // Проверяем наличие товаров
    $items = $input['items'] ?? [];
    $total = 0;
    $orderItems = [];
    
    foreach ($items as $item) {
        $product = null;
        foreach ($products as $p) {
            if ($p['id'] == $item['productId'] || $p['name'] == $item['name']) {
                $product = $p;
                break;
            }
        }
        
        if (!$product) {
            throw new Exception('Товар не найден: ' . ($item['name'] ?? $item['productId']));
        }
        
        $available = $product['stock'] - ($product['reserved'] ?? 0);
        if ($item['quantity'] > $available) {
            throw new Exception('Недостаточно товара: ' . $product['name']);
        }
        
        $orderItems[] = [
            'id' => $product['id'],
            'name' => $product['name'],
            'quantity' => $item['quantity'],
            'price' => $product['price'],
            'size' => $item['size'] ?? null,
            'image' => $product['image'] ?? ''
        ];
        
        $total += $product['price'] * $item['quantity'];
        
        // Увеличиваем резерв
        foreach ($products as &$p) {
            if ($p['id'] == $product['id']) {
                $p['reserved'] = ($p['reserved'] ?? 0) + $item['quantity'];
                break;
            }
        }
    }
    
    // Создаём заказ
    $order = [
        'id' => $orderId,
        'name' => $input['name'] ?? '',
        'phone' => $input['phone'] ?? '',
        'department' => $input['department'] ?? '',
        'email' => $input['email'] ?? '',
        'items' => json_encode($orderItems, JSON_UNESCAPED_UNICODE),
        'total' => $total,
        'status' => 'new',
        'created_at' => date('Y-m-d H:i:s'),
        'updated_at' => date('Y-m-d H:i:s')
    ];
    
    $orders[] = $order;
    
    // Сохраняем
    file_put_contents($ordersFile, json_encode($orders, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    file_put_contents($productsFile, json_encode($products, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    
    echo json_encode([
        'success' => true,
        'orderId' => $orderId,
        'total' => $total,
        'message' => 'Заказ #' . $orderId . ' создан'
    ]);
}

function handleUpdateOrderStatus($ordersFile) {
    $input = json_decode(file_get_contents('php://input'), true);
    $orderId = $input['orderId'] ?? null;
    $newStatus = $input['status'] ?? null;
    
    if (!$orderId || !$newStatus) {
        throw new Exception('Не указаны orderId или status');
    }
    
    $orders = json_decode(file_get_contents($ordersFile), true) ?? [];
    $products = json_decode(file_get_contents($productsFile), true) ?? [];
    
    $found = false;
    foreach ($orders as &$order) {
        if ($order['id'] == $orderId) {
            $oldStatus = $order['status'];
            $order['status'] = $newStatus;
            $order['updated_at'] = date('Y-m-d H:i:s');
            $found = true;
            
            // Если заказ выполнен или отменён - уменьшаем резерв
            if (in_array($newStatus, ['completed', 'cancelled'])) {
                $items = json_decode($order['items'], true) ?? [];
                foreach ($items as $item) {
                    foreach ($products as &$p) {
                        if ($p['id'] == $item['id']) {
                            $p['reserved'] = max(0, ($p['reserved'] ?? 0) - $item['quantity']);
                            
                            // Если выполнен - уменьшаем stock
                            if ($newStatus === 'completed') {
                                $p['stock'] = max(0, $p['stock'] - $item['quantity']);
                            }
                            break;
                        }
                    }
                }
                file_put_contents($productsFile, json_encode($products, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
            }
            
            break;
        }
    }
    
    if (!$found) {
        throw new Exception('Заказ #' . $orderId . ' не найден');
    }
    
    file_put_contents($ordersFile, json_encode($orders, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    
    echo json_encode([
        'success' => true,
        'message' => 'Статус заказа #' . $orderId . ' обновлён на ' . $newStatus
    ]);
}

function handleUpdateProductStock($productsFile) {
    $input = json_decode(file_get_contents('php://input'), true);
    $productId = $input['productId'] ?? null;
    $newStock = $input['stock'] ?? null;
    
    if ($productId === null || $newStock === null) {
        throw new Exception('Не указаны productId или stock');
    }
    
    $products = json_decode(file_get_contents($productsFile), true) ?? [];
    
    $found = false;
    foreach ($products as &$p) {
        if ($p['id'] == $productId) {
            $p['stock'] = intval($newStock);
            $found = true;
            break;
        }
    }
    
    if (!$found) {
        throw new Exception('Товар #' . $productId . ' не найден');
    }
    
    file_put_contents($productsFile, json_encode($products, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    
    echo json_encode([
        'success' => true,
        'message' => 'Остаток товара обновлён'
    ]);
}

function handleUpdateProduct($productsFile) {
    $input = json_decode(file_get_contents('php://input'), true);
    $productId = $input['id'] ?? null;
    
    if (!$productId) {
        throw new Exception('Не указан id товара');
    }
    
    $products = json_decode(file_get_contents($productsFile), true) ?? [];
    
    $found = false;
    foreach ($products as &$p) {
        if ($p['id'] == $productId) {
            // Обновляем только переданные поля
            if (isset($input['name'])) $p['name'] = $input['name'];
            if (isset($input['category'])) $p['category'] = $input['category'];
            if (isset($input['description'])) $p['description'] = $input['description'];
            if (isset($input['price'])) $p['price'] = intval($input['price']);
            if (isset($input['stock'])) $p['stock'] = intval($input['stock']);
            if (isset($input['image'])) $p['image'] = $input['image'];
            if (isset($input['color'])) $p['color'] = $input['color'];
            if (isset($input['sizes'])) $p['sizes'] = $input['sizes'];
            $found = true;
            break;
        }
    }
    
    if (!$found) {
        throw new Exception('Товар #' . $productId . ' не найден');
    }
    
    file_put_contents($productsFile, json_encode($products, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    
    echo json_encode([
        'success' => true,
        'message' => 'Товар обновлён'
    ]);
}
