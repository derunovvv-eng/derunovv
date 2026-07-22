/**
 * 🛒 MERCH STORE API для Google Таблиц
 * Магазин мерча Ростелеком
 */

const SHEET_NAME_PRODUCTS = 'Товары';
const SHEET_NAME_ORDERS = 'Заказы';
const SHEET_NAME_SETTINGS = 'Настройки';

// ВАЖНО: браузерный fetch(), сделавший POST на веб-приложение Apps Script,
// теряет тело запроса при переходе по редиректу Google (script.google.com -> script.googleusercontent.com).
// Поэтому ВСЕ действия — и чтение, и запись — идут через GET,
// а данные для записи передаются в параметре data как JSON-строку.
function doGet(e) {
  return handleRequest(e.parameter);
}

function doPost(e) {
  // Оставлено для совместимости, но полагаться на POST не стоит — см. комментарий выше.
  let body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {}
  return handleRequest(Object.assign({}, e.parameter, body));
}

function handleRequest(params) {
  const action = params.action;

  let data = {};
  if (params.data) {
    try {
      data = JSON.parse(params.data);
    } catch (err) {
      return jsonResponse({ success: false, error: 'Некорректный параметр data' });
    }
  }

  if (action === 'debugParams') {
    return jsonResponse({ receivedParams: params, actionValue: action, actionType: typeof action });
  } else if (action === 'getProducts') {
    return getProducts();
  } else if (action === 'getOrders') {
    return getOrders(params.api_key);
  } else if (action === 'getOrder') {
    return getOrder(params.orderId);
  } else if (action === 'ping') {
    return jsonResponse({ success: true, message: 'pong' });
  } else if (action === 'createOrder') {
    return createOrder(data);
  } else if (action === 'updateOrderStatus') {
    return updateOrderStatus(data);
  } else if (action === 'updateProduct' || action === 'updateProductStock') {
    return updateProduct(data);
  }

  return jsonResponse({ error: 'Invalid action' });
}

function getProducts() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_PRODUCTS);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const products = data.slice(1).map(row => {
      const product = {};
      headers.forEach((header, i) => {
        product[header] = row[i];
      });
      return product;
    });
    
    return jsonResponse({ success: true, products: products, count: products.length });
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() }, 500);
  }
}

function getOrders(apiKey) {
  try {
    const settingsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_SETTINGS);
    const settingsData = settingsSheet.getDataRange().getValues();
    const storedApiKey = settingsData.find(row => row[0] === 'api_key')?.[1] || '';
    
    if (apiKey !== storedApiKey) {
      return jsonResponse({ success: false, error: 'Invalid API key' }, 403);
    }
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_ORDERS);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const orders = data.slice(1).map(row => {
      const order = {};
      headers.forEach((header, i) => {
        order[header] = row[i];
      });
      return order;
    }).reverse();
    
    return jsonResponse({ success: true, orders: orders, count: orders.length });
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() }, 500);
  }
}

function getOrder(orderId) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_ORDERS);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    const orderRow = data.slice(1).find(row => row[0] == orderId);
    
    if (!orderRow) {
      return jsonResponse({ success: false, error: 'Order not found' }, 404);
    }
    
    const order = {};
    headers.forEach((header, i) => {
      order[header] = orderRow[i];
    });
    
    return jsonResponse({ success: true, order: order });
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() }, 500);
  }
}

function createOrder(data) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const settingsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_SETTINGS);
    const settingsData = settingsSheet.getDataRange().getValues();
    const storedApiKey = settingsData.find(row => row[0] === 'api_key')?.[1] || '';
    
    if (data.api_key !== storedApiKey) {
      lock.releaseLock();
      return jsonResponse({ success: false, error: 'Invalid API key' }, 403);
    }
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_ORDERS);
    
    const lastId = sheet.getLastRow() > 1 ? sheet.getRange(sheet.getLastRow(), 1).getValue() : 0;
    const orderId = lastId + 1;
    
    const orderData = [
      orderId,
      data.name,
      data.phone,
      data.department,
      JSON.stringify(data.items),
      data.total,
      'new',
      new Date().toISOString(),
      data.comment || ''
    ];
    
    sheet.appendRow(orderData);
    decrementStock(data.items);
    sendTelegramNotification(orderId, data);
    
    lock.releaseLock();
    
    return jsonResponse({ success: true, orderId: orderId });
    
  } catch (error) {
    if (lock.hasLock()) lock.releaseLock();
    return jsonResponse({ success: false, error: error.toString() }, 500);
  }
}

function decrementStock(items) {
  adjustStock(items, -1);
}

function restoreStock(items) {
  adjustStock(items, 1);
}

function adjustStock(items, sign) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_PRODUCTS);
  const data = sheet.getDataRange().getValues();

  items.forEach(item => {
    const rowIndex = data.findIndex(row => row[0] == item.productId);
    if (rowIndex > 0) {
      const currentStock = data[rowIndex][4];
      const newStock = Math.max(0, currentStock + sign * item.quantity);
      sheet.getRange(rowIndex + 1, 5).setValue(newStock);
    }
  });
}

function updateOrderStatus(data) {
  try {
    const settingsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_SETTINGS);
    const settingsData = settingsSheet.getDataRange().getValues();
    const storedApiKey = settingsData.find(row => row[0] === 'api_key')?.[1] || '';
    
    if (data.api_key !== storedApiKey) {
      return jsonResponse({ success: false, error: 'Invalid API key' }, 403);
    }
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_ORDERS);
    const ordersData = sheet.getDataRange().getValues();
    
    const rowIndex = ordersData.findIndex(row => row[0] == data.orderId);

    if (rowIndex <= 0) {
      return jsonResponse({ success: false, error: 'Order not found' }, 404);
    }

    const previousStatus = ordersData[rowIndex][6];

    // Возвращаем остатки на склад при отмене заказа, который ещё не был отменён
    if (data.status === 'cancelled' && previousStatus !== 'cancelled') {
      try {
        const items = JSON.parse(ordersData[rowIndex][4]);
        restoreStock(items);
      } catch (err) {}
    }

    sheet.getRange(rowIndex + 1, 7).setValue(data.status);

    return jsonResponse({ success: true });
    
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() }, 500);
  }
}

function updateProduct(data) {
  try {
    const settingsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_SETTINGS);
    const settingsData = settingsSheet.getDataRange().getValues();
    const storedApiKey = settingsData.find(row => row[0] === 'api_key')?.[1] || '';
    
    if (data.api_key !== storedApiKey) {
      return jsonResponse({ success: false, error: 'Invalid API key' }, 403);
    }
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_PRODUCTS);
    const productsData = sheet.getDataRange().getValues();

    const productId = data.id !== undefined ? data.id : data.productId;
    const rowIndex = productsData.findIndex(row => row[0] == productId);

    if (rowIndex <= 0) {
      return jsonResponse({ success: false, error: 'Product not found' }, 404);
    }

    if (data.stock !== undefined) sheet.getRange(rowIndex + 1, 5).setValue(Math.max(0, parseInt(data.stock)));
    if (data.price !== undefined) sheet.getRange(rowIndex + 1, 4).setValue(data.price);
    if (data.name !== undefined) sheet.getRange(rowIndex + 1, 2).setValue(data.name);
    
    return jsonResponse({ success: true });
    
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() }, 500);
  }
}

function sendTelegramNotification(orderId, data) {
  try {
    const settingsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_SETTINGS);
    const settingsData = settingsSheet.getDataRange().getValues();
    
    const botToken = settingsData.find(row => row[0] === 'telegram_bot_token')?.[1] || '';
    const chatId = settingsData.find(row => row[0] === 'telegram_chat_id')?.[1] || '';
    
    if (!botToken || !chatId) return;
    
    let itemsText = data.items.map(item => '• ' + item.name + ' × ' + item.quantity + ' шт.').join('\n');
    
    const message = '🛒 *Новый заказ #' + orderId + '*\n\n' +
      '👤 *Клиент:* ' + data.name + '\n' +
      '📱 *Телефон:* ' + data.phone + '\n' +
      '🏢 *Департамент:* ' + data.department + '\n\n' +
      '📦 *Заказ:*\n' + itemsText + '\n\n' +
      '💰 *Итого:* ' + data.total + ' ₽';
    
    const url = 'https://api.telegram.org/bot' + botToken + '/sendMessage';
    const payload = {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    };
    
    UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
  } catch (error) {
    Logger.log('Telegram error: ' + error.toString());
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function setUpWebApp() {
  Logger.log('Deploy this script as a Web App');
}
