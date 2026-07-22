# 🚀 Настройка API для магазина мерча Ростелеком

Эта инструкция поможет настроить синхронизацию между каталогом и админкой через API на вашем сервере в Яндекс Облаке.

---

## 📋 Что сделано

✅ Создана структура данных (`data/products.json`, `data/orders.json`)  
✅ Создан PHP API (`api/api.php`)  
✅ Создан Node.js API (`api/server.js`)  
✅ Обновлён каталог для работы через API  
✅ Обновлена админка для работы через API  

---

## 🗂️ Структура файлов

```
Кодинг/
├── data/
│   ├── products.json          # Данные товаров (создаётся автоматически)
│   └── orders.json            # Данные заказов (создаётся автоматически)
├── api/
│   ├── api.php                # PHP API (выберите ОДИН: PHP или Node.js)
│   ├── server.js              # Node.js API
│   └── package.json           # Зависимости для Node.js
├── каталог-мерча-красивый.html  # Фронтенд каталога
└── админка-мерча.html           # Фронтенд админки
```

---

## 🔧 Вариант 1: PHP API (рекомендуется, если есть PHP на сервере)

### Шаг 1: Загрузите файлы на сервер

1. Загрузите папку `data/` и `api/api.php` на ваш сервер в Яндекс Облаке
2. Структура на сервере должна выглядеть так:
   ```
   /var/www/html/
   ├── data/
   │   ├── products.json
   │   └── orders.json
   └── api/
       └── api.php
   ```

### Шаг 2: Настройте права доступа

```bash
chmod 755 /var/www/html/data
chmod 664 /var/www/html/data/products.json
chmod 664 /var/www/html/data/orders.json
chmod 644 /var/www/html/api/api.php
```

### Шаг 3: Проверьте работу API

Откройте в браузере:
```
https://your-domain.ru/api/api.php?action=getProducts
```

Должны вернуться товары в формате JSON.

---

## 🔧 Вариант 2: Node.js API (если PHP недоступен)

### Шаг 1: Установите Node.js на сервер

```bash
# Для Ubuntu/Debian:
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Шаг 2: Загрузите файлы

```bash
# Загрузите на сервер:
mkdir -p /opt/rt-merch-api
cd /opt/rt-merch-api
# Загрузите сюда: server.js, package.json, и папку data/
```

### Шаг 3: Установите зависимости

```bash
cd /opt/rt-merch-api
npm install
```

### Шаг 4: Запустите сервер

```bash
# Тестовый запуск:
npm start

# Production запуск (в фоне):
nohup node server.js > api.log 2>&1 &
```

### Шаг 5: Настройте Nginx как прокси

```nginx
server {
    listen 80;
    server_name your-domain.ru;

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Шаг 6: Настройте автозапуск (systemd)

Создайте файл `/etc/systemd/system/rt-merch-api.service`:

```ini
[Unit]
Description=RT Merch API Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/rt-merch-api
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Активируйте сервис:
```bash
sudo systemctl daemon-reload
sudo systemctl enable rt-merch-api
sudo systemctl start rt-merch-api
```

---

## ⚙️ Настройка фронтенда

### В обоих файлах найдите и замените URL API:

**Файл: `каталог-мерча-красивый.html`** (строка ~3620)
```javascript
const API_URL = 'https://your-domain.ru/api/api.php';
```

**Файл: `админка-мерча.html`** (строка ~572)
```javascript
const API_URL = 'https://your-domain.ru/api/api.php';
```

Замените `https://your-domain.ru/api/api.php` на ваш реальный URL API.

Для Node.js: `https://your-domain.ru/api`

---

## 🔐 Безопасность

### 1. Смените API ключ

В файлах `api.php` или `server.js` найдите:
```php
define('API_KEY', 'rt_merch_secret_key_2026');
```
или
```javascript
const API_KEY = 'rt_merch_secret_key_2026';
```

Замените на сложный ключ, например:
```php
define('API_KEY', 'rt_' . hash('sha256', 'your-secret-password'));
```

### 2. Настройте HTTPS

Если ещё не настроен, используйте Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.ru
```

### 3. Ограничьте доступ к data/

**Для Nginx** (добавьте в конфиг сервера):
```nginx
location ~ /data/ {
    deny all;
    return 404;
}
```

**Для Apache** (создайте `.htaccess` в папке `data/`):
```
Deny from all
```

---

## 🧪 Тестирование API

### Получить все товары:
```bash
curl https://your-domain.ru/api/api.php?action=getProducts
```

### Получить все заказы:
```bash
curl https://your-domain.ru/api/api.php?action=getOrders
```

### Создать заказ (POST):
```bash
curl -X POST https://your-domain.ru/api/api.php \
  -H "Content-Type: application/json" \
  -d '{
    "action": "createOrder",
    "api_key": "rt_merch_secret_key_2026",
    "name": "Иванов Иван",
    "phone": "+79991234567",
    "department": "IT",
    "items": [
      {"productId": 1, "name": "Блокнот", "quantity": 2, "size": null}
    ]
  }'
```

### Обновить статус заказа:
```bash
curl -X POST https://your-domain.ru/api/api.php \
  -H "Content-Type: application/json" \
  -d '{
    "action": "updateOrderStatus",
    "api_key": "rt_merch_secret_key_2026",
    "orderId": 1,
    "status": "confirmed"
  }'
```

### Обновить остаток товара:
```bash
curl -X POST https://your-domain.ru/api/api.php \
  -H "Content-Type: application/json" \
  -d '{
    "action": "updateProductStock",
    "api_key": "rt_merch_secret_key_2026",
    "productId": 1,
    "stock": 100
  }'
```

---

## 📊 API Эндпоинты

| Метод | Параметр | Описание | Требуется ключ |
|-------|----------|----------|----------------|
| GET | `?action=getProducts` | Получить все товары | Нет |
| GET | `?action=getOrders` | Получить все заказы | Нет |
| POST | `action=createOrder` | Создать заказ | Да |
| POST | `action=updateOrderStatus` | Обновить статус заказа | Да |
| POST | `action=updateProductStock` | Обновить остаток товара | Да |
| POST | `action=updateProduct` | Обновить данные товара | Да |

---

## 🔍 Решение проблем

### API не отвечает
1. Проверьте что сервер запущен
2. Проверьте права доступа к файлам
3. Проверьте логи сервера

### Ошибка CORS
Убедитесь что заголовки CORS настроены правильно в `api.php` или `server.js`

### Товары не загружаются
1. Откройте консоль браузера (F12)
2. Проверьте наличие ошибок
3. Проверьте что `API_URL` указан правильно

### Заказы не создаются
1. Проверьте API ключ
2. Проверьте формат запроса
3. Посмотрите логи на сервере

---

## 📱 Как пользоваться

### Для сотрудников (каталог):
1. Откройте `каталог-мерча-красивый.html`
2. Выберите товары
3. Добавьте в корзину
4. Оформите заказ

### Для администратора (админка):
1. Откройте `админка-мерча.html`
2. Просматривайте заказы
3. Меняйте статусы заказов
4. Обновляйте остатки товаров

### Синхронизация:
✅ Все данные хранятся на сервере в JSON файлах  
✅ Каталог и админка работают с одними и теми же данными  
✅ При изменении остатков в админке - они обновляются в каталоге  
✅ Заказы из каталога появляются в админке  

---

## 📞 Поддержка

При проблемах:
1. Проверьте логи сервера
2. Проверьте консоль браузера (F12)
3. Проверьте доступность API через curl
4. Убедитесь что API ключ совпадает в обоих файлах

---

**Версия:** 1.0  
**Дата:** Апрель 2026  
**Автор:** Для магазина мерча Ростелеком
